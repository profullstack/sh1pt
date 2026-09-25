import type { Artifact, Engine, EngineContext, Resource, VerifyResult } from '../types.js';

/**
 * Moving a Postgres database.
 *
 * Supabase, Neon, Railway, RDS and a Postgres in a container on a dedicated
 * box are all this engine. That is the point of splitting platforms from
 * engines: the vendor decides where the connection string comes from, and this
 * decides what to do with it.
 *
 * ## Why the custom format, and why not --clean
 *
 * `pg_dump -Fc` (custom) rather than plain SQL, because it is the only format
 * `pg_restore` can parallelise and selectively restore, and because a 4.7 GB
 * plain-text dump is unusable when one table fails. `--no-owner` and
 * `--no-acl`, because the roles on a managed provider do not exist on the
 * destination and a dump that tries to `ALTER OWNER TO supabase_admin` fails
 * on every object.
 *
 * `--clean` is deliberately NOT passed. It would make a re-run idempotent,
 * which sounds desirable, but it means a restore aimed at the wrong database
 * silently drops what is there. A migration tool should not be one typo away
 * from deleting production; an existing non-empty target is refused instead.
 *
 * ## The extension problem
 *
 * A dump records `CREATE EXTENSION pg_cron`, but an extension is a server
 * feature, not data: if the destination image does not ship it, the restore
 * fails partway, having already written some tables. Extensions are therefore
 * read during inventory and surfaced as quirks so the planner warns before
 * anything runs.
 */

const DUMP = 'dump.pgc';

/** Read the DSN off a resource, failing loudly rather than connecting to a default. */
function dsn(r: Resource): string {
  const url = r.connection.url;
  if (!url) throw new Error(`postgres resource '${r.name}' has no connection.url`);
  return url.reveal();
}

/**
 * Postgres credentials go in the environment, never in argv.
 *
 * `ps` is world-readable on a normal box, so a password spliced into a command
 * line is visible to every other user for as long as the dump runs — which for
 * a migration is hours.
 *
 * These are libpq's own variables, which `pg_dump`, `pg_restore` and `psql`
 * all read directly. That matters more than it looks: `exec` runs commands
 * without a shell, so there is nothing to expand a `$VAR` written into an
 * argument. Passing the connection through the environment is not merely
 * tidier here, it is the only thing that works.
 */
export function pgEnv(r: Resource): Record<string, string> {
  const raw = dsn(r);
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`postgres resource '${r.name}' has a connection.url that is not a URL`);
  }

  const env: Record<string, string> = {};
  if (u.hostname) env.PGHOST = decodeURIComponent(u.hostname);
  if (u.port) env.PGPORT = u.port;
  if (u.username) env.PGUSER = decodeURIComponent(u.username);
  if (u.password) env.PGPASSWORD = decodeURIComponent(u.password);
  const database = u.pathname.replace(/^\//, '');
  if (database) env.PGDATABASE = decodeURIComponent(database);
  // Managed providers almost universally require TLS, and libpq's default of
  // `prefer` silently falls back to plaintext where it is not enforced.
  env.PGSSLMODE = u.searchParams.get('sslmode') ?? 'require';
  return env;
}

/**
 * The timestamp column the delta sync keys on.
 *
 * This ends up interpolated into SQL, and it comes from a resource's metadata,
 * which comes from a config file a person edits — so it is checked against a
 * plain identifier rather than trusted. `psql -c` would happily run a second
 * statement smuggled in here, against the production database the migration is
 * reading from.
 */
export function deltaColumn(r: Resource): string {
  const raw = (r.metadata?.deltaColumns as string | undefined) ?? 'created_at';
  if (!/^[a-z_][a-z0-9_]*$/i.test(raw)) {
    throw new Error(
      `'${raw}' is not a valid column name for the delta sync of '${r.name}'. Use a plain identifier.`,
    );
  }
  return raw;
}

export const postgresEngine: Engine = {
  kind: 'postgres',
  requires: ['pg_dump', 'pg_restore', 'psql'],

  async export(ctx: EngineContext, from: Resource): Promise<Artifact[]> {
    const path = `${from.id}/${DUMP}`;
    ctx.log(`pg_dump ${from.name} → ${path}`);

    if (ctx.dryRun) {
      return [{ resourceId: from.id, kind: 'postgres', path }];
    }

    await ctx.exec(
      'pg_dump',
      [
        '--format=custom',
        '--no-owner',
        '--no-acl',
        // Compresses inside the custom format; the wire is usually the
        // bottleneck on a cloud-to-anywhere move, not the CPU.
        '--compress=6',
        '--file',
        `${ctx.staging.dir}/${path}`,
      ],
      { env: pgEnv(from), timeoutMs: 6 * 60 * 60 * 1000 },
    );

    const artifact: Artifact = { resourceId: from.id, kind: 'postgres', path };
    await ctx.staging.record(artifact);
    return [artifact];
  },

  async import(ctx: EngineContext, to: Resource, artifacts: Artifact[]): Promise<void> {
    const dump = artifacts.find((a) => a.kind === 'postgres');
    if (!dump) throw new Error(`no postgres dump staged for '${to.name}'`);

    if (ctx.dryRun) {
      ctx.log(`would pg_restore into ${to.name}`);
      return;
    }

    // Refuse to write into a database that already has user tables. Without
    // this, re-running a half-finished migration against the wrong target is
    // indistinguishable from the intended one until the duplicate-key errors
    // start, by which point the restore is half applied.
    const existing = await ctx.exec(
      'psql',
      [
        '--tuples-only',
        '--no-align',
        '--command',
        "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')",
      ],
      { env: pgEnv(to), check: false },
    );
    const tableCount = Number.parseInt(existing.stdout.trim(), 10);
    if (Number.isFinite(tableCount) && tableCount > 0) {
      throw new Error(
        `target database '${to.name}' already has ${tableCount} table(s). Refusing to restore over it — drop and recreate the database, or point at an empty one.`,
      );
    }

    ctx.log(`pg_restore → ${to.name}`);
    const res = await ctx.exec(
      'pg_restore',
      [
        '--no-owner',
        '--no-acl',
        // Parallel restore. Indexes dominate a large restore and they are
        // perfectly parallel.
        '--jobs=4',
        // Keep going so ONE failed object (a missing extension, a role that
        // does not exist) does not abandon a multi-hour restore. Errors are
        // counted and surfaced below rather than swallowed.
        '--exit-on-error=false',
        `${ctx.staging.dir}/${dump.path}`,
      ],
      { env: pgEnv(to), check: false, timeoutMs: 6 * 60 * 60 * 1000 },
    );

    if (res.code !== 0) {
      const errors = res.stderr
        .split('\n')
        .filter((l) => l.includes('error:'))
        .slice(0, 10);
      ctx.log(
        `pg_restore finished with errors (${errors.length} shown):\n${errors.join('\n')}`,
        'warn',
      );
      // A restore that produced errors is not automatically a failed
      // migration — a missing extension on a replica, for instance — but it is
      // never something to pass over silently.
      if (errors.some((e) => /could not|does not exist|permission denied/i.test(e))) {
        throw new Error(
          `pg_restore into '${to.name}' reported errors that will leave the database incomplete. First: ${errors[0] ?? 'unknown'}`,
        );
      }
    }
  },

  /**
   * Re-copy rows written during the bulk dump.
   *
   * There is no general delta for Postgres without logical replication, and
   * standing up a replication slot against a managed provider mid-migration is
   * its own project. What works in practice, and what the crawlproof migration
   * actually did, is narrower: for tables that carry a timestamp column, copy
   * the rows newer than the dump. That covers append-heavy tables (events,
   * impressions, logs) which are exactly the ones that keep being written
   * while a long dump runs.
   *
   * It does NOT cover updates to old rows or deletes. The planner says so, and
   * the honest use of this is: freeze writes to anything that mutates history,
   * and let the append-only tables catch up.
   */
  async delta(ctx: EngineContext, from: Resource, since: Date): Promise<Artifact[]> {
    const columns = deltaColumn(from);
    const path = `${from.id}/delta-${since.toISOString().replace(/[:.]/g, '')}.sql`;
    ctx.log(`delta for ${from.name} on ${columns} since ${since.toISOString()}`);

    if (ctx.dryRun) return [{ resourceId: from.id, kind: 'postgres', path }];

    // Find tables that actually have the timestamp column rather than assuming
    // a schema. A table without one cannot be delta'd and is reported.
    const found = await ctx.exec(
      'psql',
      [
        '--tuples-only',
        '--no-align',
        '--command',
        `select table_schema||'.'||table_name from information_schema.columns
           where column_name = '${columns}'
             and table_schema not in ('pg_catalog','information_schema')
           order by 1`,
      ],
      { env: pgEnv(from) },
    );

    const tables = found.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!tables.length) {
      ctx.log(`no table has a '${columns}' column; nothing can be delta-synced`, 'warn');
      return [];
    }

    const artifacts: Artifact[] = [];
    for (const table of tables) {
      const out = `${from.id}/delta-${table.replace(/[^\w]/g, '_')}.csv`;
      await ctx.exec(
        'psql',
        [
          '--command',
          `\\copy (select * from ${table} where ${columns} > '${since.toISOString()}') to '${ctx.staging.dir}/${out}' with csv header`,
        ],
        { env: pgEnv(from) },
      );
      const artifact: Artifact = {
        resourceId: from.id,
        kind: 'postgres',
        path: out,
        metadata: { table, mode: 'delta-csv' },
      };
      await ctx.staging.record(artifact);
      artifacts.push(artifact);
    }
    return artifacts;
  },

  /**
   * Compare row counts per table.
   *
   * Not a checksum — comparing 4.7 GB twice over the wire costs as much as the
   * migration did. Row counts per table catch the failures that actually
   * happen: a table that restored empty, a restore that stopped partway.
   */
  async verify(ctx: EngineContext, from: Resource, to: Resource): Promise<VerifyResult> {
    if (ctx.dryRun) return { ok: true, checks: ['dry run: not compared'], problems: [] };

    const countsQuery = `select table_schema||'.'||table_name as t,
        (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint as n
      from information_schema.tables
      where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog','information_schema')
      order by 1`;

    const read = async (r: Resource) => {
      const res = await ctx.exec(
        'psql',
        ['--tuples-only', '--no-align', '--field-separator=|', '--command', countsQuery],
        { env: pgEnv(r) },
      );
      const map = new Map<string, number>();
      for (const line of res.stdout.split('\n')) {
        const [t, n] = line.split('|');
        if (t && n !== undefined) map.set(t.trim(), Number.parseInt(n, 10));
      }
      return map;
    };

    const [a, b] = await Promise.all([read(from), read(to)]);
    const checks: string[] = [];
    const problems: string[] = [];

    for (const [table, sourceCount] of a) {
      const targetCount = b.get(table);
      if (targetCount === undefined) {
        problems.push(`${table}: missing on the target`);
        continue;
      }
      checks.push(`${table}: ${sourceCount} → ${targetCount}`);
      // The target may legitimately have MORE rows once it is live and the
      // source is frozen; fewer is always wrong.
      if (targetCount < sourceCount) {
        problems.push(`${table}: ${sourceCount} rows on the source, ${targetCount} on the target`);
      }
    }
    for (const table of b.keys()) {
      if (!a.has(table)) checks.push(`${table}: target only`);
    }

    return { ok: problems.length === 0, checks, problems };
  },
};

/**
 * The extensions a database uses, for the inventory's quirks.
 *
 * Exported so a platform can call it while building its inventory: the
 * platform knows the DSN, this knows the question worth asking.
 */
export async function postgresExtensions(
  ctx: EngineContext,
  r: Resource,
): Promise<string[]> {
  const res = await ctx.exec(
    'psql',
    ['--tuples-only', '--no-align', '--command',
      "select extname from pg_extension where extname not in ('plpgsql') order by 1"],
    { env: pgEnv(r), check: false },
  );
  if (res.code !== 0) return [];
  return res.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
}
