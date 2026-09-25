import { describe, expect, it } from 'vitest';
import { ENGINES, engineFor, requiredBinaries } from './index.js';
import { assertCopyable, endpoint, filesEngine, isRemote } from './files.js';
import { redisEngine } from './redis.js';
import { sqliteEngine } from './sqlite.js';
import type { EngineContext, ExecOptions, ExecResult, Resource } from '../types.js';
import { plain, secret } from '../types.js';
import { RESOURCE_KINDS } from '../types.js';

interface Call {
  cmd: string;
  args: string[];
  opts?: ExecOptions;
}

function ctx(responses: Array<Partial<ExecResult>> = [], over: Partial<EngineContext> = {}) {
  const calls: Call[] = [];
  let i = 0;
  const c: EngineContext & { calls: Call[] } = {
    calls,
    dryRun: false,
    log: () => {},
    staging: { dir: '/staging', record: async () => {}, existing: async () => [] },
    exec: async (cmd, args, opts) => {
      calls.push({ cmd, args, opts });
      const r = responses[i++] ?? {};
      return { code: r.code ?? 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    },
    ...over,
  };
  return c;
}

describe('the engine registry', () => {
  it('registers every engine under its own kind', () => {
    for (const [kind, engine] of ENGINES) expect(engine.kind).toBe(kind);
  });

  it('declares its required binaries so the planner can check them', () => {
    for (const engine of ENGINES.values()) {
      expect(Array.isArray(engine.requires)).toBe(true);
      expect(engine.requires.length).toBeGreaterThan(0);
    }
  });

  it('collects the binaries needed for a set of kinds, without duplicates', () => {
    const bins = requiredBinaries(['postgres', 'files', 'postgres']);
    expect(bins).toContain('pg_dump');
    expect(bins).toContain('rsync');
    expect(new Set(bins).size).toBe(bins.length);
  });

  it('returns nothing for a kind no engine handles', () => {
    // env, cron and dns are real resource kinds with no byte-moving engine;
    // they are handled as plan steps rather than copies.
    expect(engineFor('env')).toBeUndefined();
    expect(engineFor('cron')).toBeUndefined();
  });

  it('covers a documented subset of the resource kinds', () => {
    const covered = [...ENGINES.keys()];
    for (const k of covered) expect(RESOURCE_KINDS).toContain(k);
  });
});

describe('sqlite / libSQL', () => {
  const file = (over: Partial<Resource> = {}): Resource => ({
    kind: 'sqlite',
    id: 'db',
    name: 'app.db',
    connection: { path: plain('/data/app.db') },
    ...over,
  });
  const turso = (): Resource => ({
    kind: 'sqlite',
    id: 'db',
    name: 'prod',
    connection: { tursoDatabase: plain('prod'), authToken: secret('tok') },
  });

  it('dumps a local file to staging via stdout redirection', async () => {
    const c = ctx();
    await sqliteEngine.export(c, file());
    expect(c.calls[0]!.cmd).toBe('sqlite3');
    expect(c.calls[0]!.args).toContain('.dump');
    expect(c.calls[0]!.opts?.stdoutFile).toBe('/staging/db/dump.sql');
  });

  it('dumps a Turso database with the same engine', async () => {
    const c = ctx();
    await sqliteEngine.export(c, turso());
    expect(c.calls[0]!.cmd).toBe('turso');
    expect(c.calls[0]!.opts?.stdoutFile).toBe('/staging/db/dump.sql');
  });

  it('keeps the Turso token out of argv', async () => {
    const c = ctx();
    await sqliteEngine.export(c, turso());
    expect(c.calls[0]!.args.join(' ')).not.toContain('tok');
    expect(c.calls[0]!.opts?.env?.TURSO_API_TOKEN).toBe('tok');
  });

  it('loads into Turso from stdin, which is the direction that makes it bidirectional', async () => {
    const c = ctx();
    await sqliteEngine.import(c, turso(), [{ resourceId: 'db', kind: 'sqlite', path: 'db/dump.sql' }]);
    expect(c.calls[0]!.opts?.stdinFile).toBe('/staging/db/dump.sql');
  });

  it('refuses a resource with no path', async () => {
    const c = ctx();
    await expect(sqliteEngine.export(c, file({ connection: {} }))).rejects.toThrow(/no connection.path/);
  });
});

describe('redis', () => {
  const r = (over: Partial<Resource> = {}): Resource => ({
    kind: 'redis',
    id: 'r',
    name: 'cache',
    connection: { url: secret('redis://h:6379') },
    ...over,
  });

  it('uses --rdb, which is consistent, rather than walking keys, which is not', async () => {
    const c = ctx();
    await redisEngine.export(c, r());
    expect(c.calls[0]!.args).toContain('--rdb');
  });

  it('has no delta, so the planner warns that writes during the copy are lost', () => {
    expect(redisEngine.delta).toBeUndefined();
  });

  it('refuses to load over the wire and says what to do instead', async () => {
    const c = ctx();
    await expect(
      redisEngine.import(c, r(), [{ resourceId: 'r', kind: 'redis', path: 'r/dump.rdb' }]),
    ).rejects.toThrow(/data directory/);
  });

  it('places the file when the target declares a data directory', async () => {
    const c = ctx();
    const target = r({ connection: { url: secret('redis://h'), dataDir: plain('/var/lib/redis') } });
    await redisEngine.import(c, target, [{ resourceId: 'r', kind: 'redis', path: 'r/dump.rdb' }]);
    expect(c.calls[0]!.args[1]).toBe('/var/lib/redis/dump.rdb');
  });
});

describe('files', () => {
  const local = (): Resource => ({
    kind: 'files',
    id: 'v',
    name: 'uploads',
    connection: { path: plain('/data/uploads') },
  });
  const remote = (over: Record<string, string> = {}): Resource => ({
    kind: 'files',
    id: 'v2',
    name: 'www',
    connection: {
      path: plain('/home/anthony/www'),
      host: plain('dev2.example.com'),
      user: plain('anthony'),
      ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, plain(v)])),
    },
  });

  it('always ends an endpoint with a slash, so rsync copies contents not the directory', () => {
    expect(endpoint(local())).toBe('/data/uploads/');
    expect(endpoint(remote())).toBe('anthony@dev2.example.com:/home/anthony/www/');
  });

  it('knows which side is remote', () => {
    expect(isRemote(local())).toBe(false);
    expect(isRemote(remote())).toBe(true);
  });

  it('refuses remote-to-remote, which rsync cannot do at all', () => {
    expect(() => assertCopyable(remote(), remote())).toThrow(/cannot copy directly between two remote/);
  });

  it('allows a copy when one side is local', () => {
    expect(() => assertCopyable(remote(), local())).not.toThrow();
    expect(() => assertCopyable(local(), remote())).not.toThrow();
  });

  it('never passes --delete, which is how a wrong target destroys a directory', async () => {
    const c = ctx();
    await filesEngine.import(c, remote(), [], local());
    const args = c.calls[0]!.args;
    expect(args).not.toContain('--delete');
    expect(args.some((a) => a.startsWith('--delete'))).toBe(false);
  });

  it('carries an ssh key and port into the transport when configured', async () => {
    const c = ctx();
    await filesEngine.import(c, remote({ sshKeyPath: '/k/id', sshPort: '2222' }), [], local());
    const e = c.calls[0]!.args[c.calls[0]!.args.indexOf('-e') + 1];
    expect(e).toContain('-i /k/id');
    expect(e).toContain('-p 2222');
  });
});
