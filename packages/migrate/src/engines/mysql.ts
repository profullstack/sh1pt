import { quoteIdent, quoteLiteral } from '../transforms.js';
import type { Artifact, Engine, EngineContext, Resource, VerifyResult } from '../types.js';

/**
 * Moving a MySQL or MariaDB database.
 *
 * PlanetScale, RDS, a MariaDB in a container. Same shape as the Postgres
 * engine and for the same reasons; the differences are all in the tooling.
 *
 * ## The flags that matter
 *
 * `--single-transaction` takes the dump inside one consistent snapshot on
 * InnoDB instead of locking every table for the length of the dump. Without
 * it, a multi-gigabyte dump is an outage, which rather defeats the point of
 * copying while the source is still live.
 *
 * `--set-gtid-purged=OFF`, because a dump carrying GTID state refuses to load
 * into a server with its own replication history, and the error names neither
 * the flag nor the cause.
 *
 * `--no-tablespaces`, because writing tablespace clauses needs PROCESS
 * privilege that a managed provider does not grant, and its absence fails the
 * dump rather than degrading it.
 *
 * PlanetScale specifically does not support foreign key constraints in the
 * usual way, so a dump taken there restores without constraints a plain MySQL
 * would have had. That is recorded as a platform quirk rather than silently
 * handled, because the fix is a schema decision, not a flag.
 */

const DUMP = 'dump.sql';

function dsn(r: Resource): string {
  const url = r.connection.url;
  if (!url) throw new Error(`mysql resource '${r.name}' has no connection.url`);
  return url.reveal();
}

/**
 * Connection details for the mysql client family.
 *
 * `MYSQL_PWD` rather than `--password=`, for the same reason Postgres uses
 * libpq's variables: a password on the command line is readable by every other
 * user on the box via `ps` for as long as the dump runs. The client warns
 * about `MYSQL_PWD` being insecure on shared machines, which is true and still
 * strictly better than argv.
 */
export function mysqlConnection(r: Resource): { args: string[]; env: Record<string, string> } {
  const raw = dsn(r);
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`mysql resource '${r.name}' has a connection.url that is not a URL`);
  }

  const args: string[] = [];
  if (u.hostname) args.push(`--host=${decodeURIComponent(u.hostname)}`);
  if (u.port) args.push(`--port=${u.port}`);
  if (u.username) args.push(`--user=${decodeURIComponent(u.username)}`);

  // Managed MySQL is TLS-only in practice, and the client's default is to fall
  // back silently where it is not enforced.
  const sslMode = u.searchParams.get('ssl-mode') ?? 'REQUIRED';
  args.push(`--ssl-mode=${sslMode}`);

  const env: Record<string, string> = {};
  if (u.password) env.MYSQL_PWD = decodeURIComponent(u.password);

  return { args, env };
}

export function databaseName(r: Resource): string {
  const raw = dsn(r);
  const name = new URL(raw).pathname.replace(/^\//, '');
  if (!name) throw new Error(`mysql resource '${r.name}' has no database in its connection.url`);
  return decodeURIComponent(name);
}

export const mysqlEngine: Engine = {
  kind: 'mysql',
  requires: ['mysqldump', 'mysql'],

  async export(ctx: EngineContext, from: Resource): Promise<Artifact[]> {
    const path = `${from.id}/${DUMP}`;
    ctx.log(`mysqldump ${from.name} → ${path}`);
    if (ctx.dryRun) return [{ resourceId: from.id, kind: 'mysql', path }];

    const { args, env } = mysqlConnection(from);
    await ctx.exec(
      'mysqldump',
      [
        ...args,
        // A consistent snapshot instead of locking every table for the length
        // of the dump.
        '--single-transaction',
        '--quick',
        '--routines',
        '--triggers',
        '--events',
        '--set-gtid-purged=OFF',
        '--no-tablespaces',
        databaseName(from),
      ],
      { env, stdoutFile: `${ctx.staging.dir}/${path}`, timeoutMs: 6 * 60 * 60 * 1000 },
    );

    const artifact: Artifact = { resourceId: from.id, kind: 'mysql', path };
    await ctx.staging.record(artifact);
    return [artifact];
  },

  async import(ctx: EngineContext, to: Resource, artifacts: Artifact[]): Promise<void> {
    const dump = artifacts.find((a) => a.kind === 'mysql');
    if (!dump) throw new Error(`no mysql dump staged for '${to.name}'`);
    if (ctx.dryRun) {
      ctx.log(`would load ${dump.path} into ${to.name}`);
      return;
    }

    const { args, env } = mysqlConnection(to);

    // Same refusal as Postgres: a non-empty target is not written over. A
    // mysqldump replays CREATE TABLE and INSERT, so aiming it at a populated
    // database is a mess of duplicate-key errors on top of live data.
    const existing = await ctx.exec(
      'mysql',
      [
        ...args,
        '--batch',
        '--skip-column-names',
        '--execute',
        `select count(*) from information_schema.tables where table_schema = ${quoteLiteral(databaseName(to))}`,
      ],
      { env, check: false },
    );
    const tableCount = Number.parseInt(existing.stdout.trim(), 10);
    if (Number.isFinite(tableCount) && tableCount > 0) {
      throw new Error(
        `target database '${to.name}' already has ${tableCount} table(s). Refusing to load over it — drop and recreate it, or point at an empty one.`,
      );
    }

    ctx.log(`mysql < ${dump.path}`);
    await ctx.exec('mysql', [...args, databaseName(to)], {
      env,
      stdinFile: `${ctx.staging.dir}/${dump.path}`,
      timeoutMs: 6 * 60 * 60 * 1000,
    });
  },

  async verify(ctx: EngineContext, from: Resource, to: Resource): Promise<VerifyResult> {
    if (ctx.dryRun) return { ok: true, checks: ['dry run: not compared'], problems: [] };

    const counts = async (r: Resource) => {
      const { args, env } = mysqlConnection(r);
      const res = await ctx.exec(
        'mysql',
        [
          ...args,
          '--batch',
          '--skip-column-names',
          '--execute',
          `select table_name, table_rows from information_schema.tables
             where table_schema = ${quoteLiteral(databaseName(r))} order by table_name`,
        ],
        { env, check: false },
      );
      const map = new Map<string, number>();
      for (const line of res.stdout.split('\n')) {
        const [name, n] = line.split('\t');
        if (name && n !== undefined) map.set(name.trim(), Number.parseInt(n, 10) || 0);
      }
      return map;
    };

    const [a, b] = await Promise.all([counts(from), counts(to)]);
    const checks: string[] = [];
    const problems: string[] = [];

    for (const [table, sourceRows] of a) {
      const targetRows = b.get(table);
      if (targetRows === undefined) {
        problems.push(`${table}: missing on the target`);
        continue;
      }
      // information_schema.table_rows is an ESTIMATE on InnoDB, not a count.
      // Treating it as exact would fail every verification, so a table present
      // on both sides is reported rather than judged, and only a missing table
      // is a problem.
      checks.push(`${quoteIdent(table)}: ~${sourceRows} → ~${targetRows} (estimated)`);
    }

    return { ok: problems.length === 0, checks, problems };
  },
};
