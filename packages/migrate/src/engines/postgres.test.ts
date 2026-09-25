import { describe, expect, it } from 'vitest';
import { deltaColumn, pgEnv, postgresEngine } from './postgres.js';
import type { Artifact, EngineContext, ExecOptions, ExecResult, Resource } from '../types.js';
import { secret } from '../types.js';

/*
 * A fake password, named rather than inlined, for the same reason as in
 * plan.test.ts: these tests are about credential HANDLING, so they need a
 * credential, but a literal DSN-with-password in source is indistinguishable
 * from a real leak to a scanner.
 */
const FAKE_PASSWORD = 'p%40ss';

interface Call {
  cmd: string;
  args: string[];
  opts?: ExecOptions;
}

/**
 * A context that records commands instead of running them. This is the whole
 * reason `exec` is injected: the engine is fully exercised with no Postgres.
 */
function ctx(
  responses: Array<Partial<ExecResult>> = [],
  over: Partial<EngineContext> = {},
): EngineContext & { calls: Call[]; recorded: Artifact[] } {
  const calls: Call[] = [];
  const recorded: Artifact[] = [];
  let i = 0;
  return {
    calls,
    recorded,
    dryRun: false,
    log: () => {},
    staging: {
      dir: '/staging',
      record: async (a) => {
        recorded.push(a);
      },
      existing: async () => [],
    },
    exec: async (cmd, args, opts) => {
      calls.push({ cmd, args, opts });
      const r = responses[i++] ?? {};
      return { code: r.code ?? 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    },
    ...over,
  };
}

const db = (over: Partial<Resource> = {}): Resource => ({
  kind: 'postgres',
  id: 'db',
  name: 'app',
  connection: { url: secret(`postgres://u:${FAKE_PASSWORD}@db.example.com:5432/appdb`) },
  ...over,
});

describe('pgEnv', () => {
  it('splits the DSN into libpq variables so nothing lands in argv', () => {
    const env = pgEnv(db());
    expect(env.PGHOST).toBe('db.example.com');
    expect(env.PGPORT).toBe('5432');
    expect(env.PGUSER).toBe('u');
    expect(env.PGDATABASE).toBe('appdb');
  });

  it('url-decodes a password containing reserved characters', () => {
    expect(pgEnv(db()).PGPASSWORD).toBe('p@ss');
  });

  it('requires TLS by default rather than letting libpq fall back to plaintext', () => {
    expect(pgEnv(db()).PGSSLMODE).toBe('require');
  });

  it('honours an explicit sslmode in the DSN', () => {
    const r = db({ connection: { url: secret(`postgres://u:${FAKE_PASSWORD}@h/d?sslmode=disable`) } });
    expect(pgEnv(r).PGSSLMODE).toBe('disable');
  });

  it('refuses a resource with no connection url', () => {
    expect(() => pgEnv(db({ connection: {} }))).toThrow(/no connection.url/);
  });

  it('refuses a connection url that is not a URL', () => {
    expect(() => pgEnv(db({ connection: { url: secret('not a url') } }))).toThrow(/not a URL/);
  });
});

describe('export', () => {
  it('dumps in the custom format with no owner or acl', async () => {
    const c = ctx();
    const artifacts = await postgresEngine.export(c, db());

    const call = c.calls[0]!;
    expect(call.cmd).toBe('pg_dump');
    expect(call.args).toContain('--format=custom');
    expect(call.args).toContain('--no-owner');
    expect(call.args).toContain('--no-acl');
    expect(artifacts[0]?.path).toBe('db/dump.pgc');
    expect(c.recorded).toHaveLength(1);
  });

  it('never puts the password in argv', async () => {
    const c = ctx();
    await postgresEngine.export(c, db());
    expect(c.calls[0]!.args.join(' ')).not.toContain('p@ss');
    expect(c.calls[0]!.opts?.env?.PGPASSWORD).toBe('p@ss');
  });

  it('runs nothing on a dry run but still reports the artifact', async () => {
    const c = ctx([], { dryRun: true });
    const artifacts = await postgresEngine.export(c, db());
    expect(c.calls).toHaveLength(0);
    expect(artifacts[0]?.path).toBe('db/dump.pgc');
  });
});

describe('import', () => {
  const dump: Artifact = { resourceId: 'db', kind: 'postgres', path: 'db/dump.pgc' };

  it('restores into an empty database', async () => {
    const c = ctx([{ stdout: '0' }, { code: 0 }]);
    await postgresEngine.import(c, db(), [dump]);
    expect(c.calls[1]!.cmd).toBe('pg_restore');
    expect(c.calls[1]!.args).toContain('--no-owner');
  });

  it('refuses to restore over a database that already has tables', async () => {
    const c = ctx([{ stdout: '42' }]);
    await expect(postgresEngine.import(c, db(), [dump])).rejects.toThrow(/already has 42 table/);
    // Nothing was restored.
    expect(c.calls.some((x) => x.cmd === 'pg_restore')).toBe(false);
  });

  it('never passes --clean, which would drop an existing database', async () => {
    const c = ctx([{ stdout: '0' }, { code: 0 }]);
    await postgresEngine.import(c, db(), [dump]);
    expect(c.calls[1]!.args).not.toContain('--clean');
  });

  it('throws when the restore reports errors that leave the database incomplete', async () => {
    const c = ctx([
      { stdout: '0' },
      { code: 1, stderr: 'pg_restore: error: could not execute query: extension "pg_cron" does not exist' },
    ]);
    await expect(postgresEngine.import(c, db(), [dump])).rejects.toThrow(/incomplete/);
  });

  it('tolerates a non-zero exit whose errors are benign', async () => {
    const c = ctx([{ stdout: '0' }, { code: 1, stderr: 'pg_restore: warning: something cosmetic' }]);
    await expect(postgresEngine.import(c, db(), [dump])).resolves.toBeUndefined();
  });

  it('fails when no dump was staged', async () => {
    const c = ctx();
    await expect(postgresEngine.import(c, db(), [])).rejects.toThrow(/no postgres dump staged/);
  });
});

describe('deltaColumn', () => {
  it('defaults to created_at', () => {
    expect(deltaColumn(db())).toBe('created_at');
  });

  it('accepts a plain identifier', () => {
    expect(deltaColumn(db({ metadata: { deltaColumns: 'updated_at' } }))).toBe('updated_at');
  });

  it('refuses anything that could smuggle a second statement into psql', () => {
    for (const bad of ["created_at'; drop table users; --", 'a b', 'a-b', '1col', '']) {
      expect(() => deltaColumn(db({ metadata: { deltaColumns: bad } }))).toThrow(/valid column name/);
    }
  });
});

describe('delta', () => {
  it('only copies from tables that actually have the timestamp column', async () => {
    const c = ctx([{ stdout: 'public|events\npublic|impressions\n' }, {}, {}]);
    const out = await postgresEngine.delta!(c, db(), new Date('2026-09-24T20:00:00Z'));
    expect(out).toHaveLength(2);
    expect(out[0]?.metadata?.table).toBe('public.events');
  });

  it('reports nothing to do when no table has the column', async () => {
    const c = ctx([{ stdout: '' }]);
    const out = await postgresEngine.delta!(c, db(), new Date());
    expect(out).toEqual([]);
  });

  it('quotes every identifier, so a table named after a reserved word still parses', async () => {
    const c = ctx([{ stdout: 'public|user\npublic|order\n' }, {}, {}]);
    await postgresEngine.delta!(c, db(), new Date('2026-09-24T20:00:00Z'));

    const copy = c.calls[1]!.args.join(' ');
    expect(copy).toContain('"public"."user"');
    expect(copy).not.toMatch(/from public\.user\b/);
  });

  it('quotes the timestamp column too', async () => {
    const c = ctx([{ stdout: 'public|events\n' }, {}]);
    await postgresEngine.delta!(c, db(), new Date('2026-09-24T20:00:00Z'));
    expect(c.calls[1]!.args.join(' ')).toContain('"created_at" >');
  });

  it('skips a malformed row rather than building half a table name', async () => {
    const c = ctx([{ stdout: 'public|events\ngarbage-no-separator\n' }, {}]);
    const out = await postgresEngine.delta!(c, db(), new Date());
    expect(out).toHaveLength(1);
  });
});

describe('verify', () => {
  const counts = (rows: string) => ({ stdout: rows });

  it('passes when every table matches', async () => {
    const c = ctx([counts('public.users|113\npublic.posts|48\n'), counts('public.users|113\npublic.posts|48\n')]);
    const res = await postgresEngine.verify!(c, db(), db());
    expect(res.ok).toBe(true);
    expect(res.checks).toContain('public.users: 113 → 113');
  });

  it('fails when the target has fewer rows', async () => {
    const c = ctx([counts('public.users|113\n'), counts('public.users|9\n')]);
    const res = await postgresEngine.verify!(c, db(), db());
    expect(res.ok).toBe(false);
    expect(res.problems[0]).toContain('113 rows on the source, 9 on the target');
  });

  it('flags a table missing entirely from the target', async () => {
    const c = ctx([counts('public.users|1\npublic.gone|5\n'), counts('public.users|1\n')]);
    const res = await postgresEngine.verify!(c, db(), db());
    expect(res.problems.some((p) => p.includes('public.gone'))).toBe(true);
  });

  it('accepts a target that has gained rows, since it is live and the source is frozen', async () => {
    const c = ctx([counts('public.events|100\n'), counts('public.events|140\n')]);
    const res = await postgresEngine.verify!(c, db(), db());
    expect(res.ok).toBe(true);
  });
});
