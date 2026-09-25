import { describe, expect, it } from 'vitest';
import { databaseName, mysqlConnection, mysqlEngine } from './mysql.js';
import type { Artifact, EngineContext, ExecOptions, ExecResult, Resource } from '../types.js';
import { secret } from '../types.js';

/* Named rather than inlined; see postgres.test.ts. */
const FAKE_PASSWORD = 'p%40ss';

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

const db = (over: Partial<Resource> = {}): Resource => ({
  kind: 'mysql',
  id: 'db',
  name: 'app',
  connection: { url: secret(`mysql://u:${FAKE_PASSWORD}@db.example.com:3306/appdb`) },
  ...over,
});

describe('mysqlConnection', () => {
  it('splits host, port and user into flags', () => {
    const { args } = mysqlConnection(db());
    expect(args).toContain('--host=db.example.com');
    expect(args).toContain('--port=3306');
    expect(args).toContain('--user=u');
  });

  it('puts the password in MYSQL_PWD, never in argv where ps can read it', () => {
    const { args, env } = mysqlConnection(db());
    expect(env.MYSQL_PWD).toBe('p@ss');
    expect(args.join(' ')).not.toContain('p@ss');
    expect(args.some((a) => a.startsWith('--password'))).toBe(false);
  });

  it('requires TLS by default', () => {
    expect(mysqlConnection(db()).args).toContain('--ssl-mode=REQUIRED');
  });

  it('honours an explicit ssl-mode', () => {
    const r = db({ connection: { url: secret('mysql://u@h:3306/d?ssl-mode=DISABLED') } });
    expect(mysqlConnection(r).args).toContain('--ssl-mode=DISABLED');
  });

  it('refuses a url that is not a URL', () => {
    expect(() => mysqlConnection(db({ connection: { url: secret('nope') } }))).toThrow(/not a URL/);
  });
});

describe('databaseName', () => {
  it('is the path of the DSN', () => {
    expect(databaseName(db())).toBe('appdb');
  });

  it('refuses a DSN naming no database', () => {
    expect(() => databaseName(db({ connection: { url: secret('mysql://u@h:3306/') } }))).toThrow(
      /no database/,
    );
  });
});

describe('export', () => {
  it('dumps in one transaction rather than locking every table for hours', async () => {
    const c = ctx();
    await mysqlEngine.export(c, db());
    expect(c.calls[0]!.cmd).toBe('mysqldump');
    expect(c.calls[0]!.args).toContain('--single-transaction');
  });

  it('turns off GTID state, which otherwise refuses to load elsewhere', async () => {
    const c = ctx();
    await mysqlEngine.export(c, db());
    expect(c.calls[0]!.args).toContain('--set-gtid-purged=OFF');
  });

  it('skips tablespaces, which need a privilege managed providers do not grant', async () => {
    const c = ctx();
    await mysqlEngine.export(c, db());
    expect(c.calls[0]!.args).toContain('--no-tablespaces');
  });

  it('writes to staging via stdout redirection', async () => {
    const c = ctx();
    const [artifact] = await mysqlEngine.export(c, db());
    expect(c.calls[0]!.opts?.stdoutFile).toBe('/staging/db/dump.sql');
    expect(artifact?.path).toBe('db/dump.sql');
  });

  it('runs nothing on a dry run', async () => {
    const c = ctx([], { dryRun: true });
    await mysqlEngine.export(c, db());
    expect(c.calls).toHaveLength(0);
  });
});

describe('import', () => {
  const dump: Artifact = { resourceId: 'db', kind: 'mysql', path: 'db/dump.sql' };

  it('loads into an empty database from stdin', async () => {
    const c = ctx([{ stdout: '0' }, {}]);
    await mysqlEngine.import(c, db(), [dump]);
    expect(c.calls[1]!.opts?.stdinFile).toBe('/staging/db/dump.sql');
  });

  it('refuses to load over a database that already has tables', async () => {
    const c = ctx([{ stdout: '17' }]);
    await expect(mysqlEngine.import(c, db(), [dump])).rejects.toThrow(/already has 17 table/);
    expect(c.calls).toHaveLength(1);
  });

  it('fails when nothing was staged', async () => {
    await expect(mysqlEngine.import(ctx(), db(), [])).rejects.toThrow(/no mysql dump staged/);
  });
});

describe('verify', () => {
  it('reports estimated counts without failing on them', async () => {
    // information_schema.table_rows is an estimate on InnoDB. Treating it as
    // exact would fail every single verification.
    const c = ctx([{ stdout: 'users\t113\n' }, { stdout: 'users\t108\n' }]);
    const res = await mysqlEngine.verify!(c, db(), db());
    expect(res.ok).toBe(true);
    expect(res.checks[0]).toContain('estimated');
  });

  it('fails only when a table is missing entirely', async () => {
    const c = ctx([{ stdout: 'users\t1\nposts\t2\n' }, { stdout: 'users\t1\n' }]);
    const res = await mysqlEngine.verify!(c, db(), db());
    expect(res.ok).toBe(false);
    expect(res.problems[0]).toContain('posts');
  });
});
