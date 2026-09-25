import type { Artifact, Engine, EngineContext, Resource, VerifyResult } from '../types.js';

/**
 * Moving a SQLite or libSQL database.
 *
 * Turso is libSQL, which is SQLite with a server in front, and a local
 * `app.db` is SQLite with nothing in front. Both dump to the same SQL text,
 * which is why they are one engine — and why Turso→dedicated and
 * dedicated→Turso are the same code path.
 *
 * The dump is plain SQL rather than a file copy. Copying the file works for a
 * local database and not at all for a hosted one, and a SQLite file copied
 * while something is writing to it is a corrupt file rather than an error. The
 * text dump is slower and always correct.
 *
 * Note the `.dump` output includes `PRAGMA foreign_keys=OFF` and wraps in a
 * transaction on its own, which is what lets the rows load in whatever order
 * the dump emitted them.
 */

const DUMP = 'dump.sql';

/** Turso's CLI talks to a named database; plain SQLite takes a file path. */
function isTurso(r: Resource): boolean {
  return Boolean(r.connection.tursoDatabase) || r.metadata?.platform === 'turso';
}

function tursoEnv(r: Resource): Record<string, string> {
  const token = r.connection.authToken?.reveal();
  return token ? { TURSO_API_TOKEN: token } : {};
}

function filePath(r: Resource): string {
  const p = r.connection.path?.reveal();
  if (!p) throw new Error(`sqlite resource '${r.name}' has no connection.path`);
  return p;
}

export const sqliteEngine: Engine = {
  kind: 'sqlite',
  /*
   * `sqlite3` only. Which binary is needed actually depends on the resource —
   * a Turso database is reached with `turso`, a file with `sqlite3` — but
   * `requires` is a property of the engine, not of one side of one migration.
   * Declaring the union would block a file-to-file move on a missing Turso CLI
   * nobody needs, so the Turso side is checked at the point of use instead and
   * fails with a message naming the binary.
   */
  requires: ['sqlite3'],

  async export(ctx: EngineContext, from: Resource): Promise<Artifact[]> {
    const path = `${from.id}/${DUMP}`;
    ctx.log(`dumping ${from.name} → ${path}`);
    if (ctx.dryRun) return [{ resourceId: from.id, kind: 'sqlite', path }];

    const out = `${ctx.staging.dir}/${path}`;
    if (isTurso(from)) {
      const db = from.connection.tursoDatabase!.reveal();
      await ctx.exec('turso', ['db', 'shell', db, '.dump'], {
        env: tursoEnv(from),
        timeoutMs: 2 * 60 * 60 * 1000,
        stdoutFile: out,
      });
    } else {
      await ctx.exec('sqlite3', [filePath(from), '.dump'], {
        timeoutMs: 2 * 60 * 60 * 1000,
        stdoutFile: out,
      });
    }

    const artifact: Artifact = { resourceId: from.id, kind: 'sqlite', path };
    await ctx.staging.record(artifact);
    return [artifact];
  },

  async import(ctx: EngineContext, to: Resource, artifacts: Artifact[]): Promise<void> {
    const dump = artifacts.find((a) => a.kind === 'sqlite');
    if (!dump) throw new Error(`no sqlite dump staged for '${to.name}'`);
    if (ctx.dryRun) {
      ctx.log(`would load ${dump.path} into ${to.name}`);
      return;
    }

    const file = `${ctx.staging.dir}/${dump.path}`;
    if (isTurso(to)) {
      const db = to.connection.tursoDatabase!.reveal();
      await ctx.exec('turso', ['db', 'shell', db], {
        env: tursoEnv(to),
        timeoutMs: 2 * 60 * 60 * 1000,
        stdinFile: file,
      });
    } else {
      await ctx.exec('sqlite3', [filePath(to), `.read ${file}`], {
        timeoutMs: 2 * 60 * 60 * 1000,
      });
    }
  },

  async verify(ctx: EngineContext, from: Resource, to: Resource): Promise<VerifyResult> {
    if (ctx.dryRun) return { ok: true, checks: ['dry run: not compared'], problems: [] };

    const countTables = async (r: Resource) => {
      const sql =
        "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by 1";
      const res = isTurso(r)
        ? await ctx.exec('turso', ['db', 'shell', r.connection.tursoDatabase!.reveal(), sql], {
            env: tursoEnv(r),
            check: false,
          })
        : await ctx.exec('sqlite3', [filePath(r), sql], { check: false });
      return res.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    };

    const [a, b] = await Promise.all([countTables(from), countTables(to)]);
    const missing = a.filter((t) => !b.includes(t));
    return {
      ok: missing.length === 0,
      checks: [`tables: ${a.length} → ${b.length}`],
      problems: missing.map((t) => `${t}: missing on the target`),
    };
  },
};
