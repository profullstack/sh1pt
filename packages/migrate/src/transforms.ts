/**
 * Rewriting absolute URLs that point at the place you just left.
 *
 * This is the failure that makes migrations dangerous months after they look
 * successful. An app stores an uploaded file and, instead of keeping a key,
 * writes the whole URL into a row:
 *
 *   https://ywcizjsgrcmhgyplldac.supabase.co/storage/v1/object/public/ads/x.png
 *
 * Migrate the bucket and the database, cut DNS over, check the site: every
 * image loads. They load because the OLD account still exists and is still
 * serving them. The day that account is closed — which is the whole point of
 * migrating, and which happens weeks later once everyone is confident — every
 * one of those rows 404s at once, and nothing connects the outage to the
 * migration.
 *
 * crawlproof.com had 2,928 such rows across four tables. They were found by
 * looking, not by anything failing.
 *
 * So this is a first-class step rather than a footnote: find every column that
 * could hold one, report what is there, and rewrite it inside the same
 * transaction that a person can roll back.
 *
 * Nothing here executes SQL. It builds statements and the caller runs them,
 * which keeps it testable and keeps the generated SQL reviewable before it
 * touches a database.
 */

/** A host whose URLs must be rewritten, and what to replace it with. */
export interface HostRewrite {
  /** The old host, e.g. `abc123.supabase.co`. No scheme, no path. */
  from: string;
  /** The new origin, e.g. `https://cdn.example.com`. Scheme required. */
  to: string;
}

/** Text-ish column types worth scanning. */
const TEXT_TYPES = new Set(['text', 'character varying', 'character', 'json', 'jsonb']);

export interface ColumnRef {
  schema: string;
  table: string;
  column: string;
  dataType: string;
}

/**
 * The query that finds columns which could hold a URL.
 *
 * Every text-ish column in a user schema. Deliberately broad: a column called
 * `notes` holding a pasted URL breaks exactly as badly as one called
 * `image_url`, and guessing from names is how the four crawlproof tables would
 * have been missed. The count query that follows narrows it cheaply.
 */
export function findTextColumnsSql(): string {
  return `select table_schema, table_name, column_name, data_type
    from information_schema.columns
    where table_schema not in ('pg_catalog', 'information_schema')
      and data_type in ('text', 'character varying', 'character', 'json', 'jsonb')
    order by table_schema, table_name, column_name`;
}

/** True when a column's type can hold a URL. */
export function isScannable(dataType: string): boolean {
  return TEXT_TYPES.has(dataType.toLowerCase());
}

/**
 * Postgres identifiers are quoted rather than interpolated bare.
 *
 * These names come from information_schema, so they are real identifiers, but
 * a table legitimately named `user` or `order` is a reserved word and an
 * unquoted reference is a syntax error partway through a migration. Doubling
 * any embedded quote is the standard escape.
 */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** A single-quoted SQL string literal. */
export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Fully-qualified, safely quoted. */
export function qualify(c: Pick<ColumnRef, 'schema' | 'table'>): string {
  return `${quoteIdent(c.schema)}.${quoteIdent(c.table)}`;
}

/**
 * Count rows in one column that mention the old host.
 *
 * Run before rewriting anything: it turns "this might be a problem" into "2,928
 * rows in four tables", which is what makes the step reviewable. A cast to text
 * lets one statement cover json and jsonb alongside the plain text types.
 */
export function countMatchesSql(c: ColumnRef, host: string): string {
  return `select ${quoteLiteral(`${c.schema}.${c.table}.${c.column}`)} as ref, count(*) as n
    from ${qualify(c)}
    where ${quoteIdent(c.column)}::text like ${quoteLiteral(`%${host}%`)}`;
}

/**
 * Rewrite one column.
 *
 * `replace` on the text form rather than a regex: the host is a literal, a
 * regex would need escaping, and `replace` is index-friendly and predictable.
 * The `where` clause means untouched rows are not rewritten, which keeps the
 * update small and leaves `updated_at` triggers alone on rows that did not
 * change.
 *
 * json and jsonb are cast out to text and back, which is lossy for jsonb key
 * order but not for content — and jsonb does not preserve key order anyway.
 */
export function rewriteColumnSql(c: ColumnRef, rewrite: HostRewrite): string {
  const from = quoteLiteral(`https://${rewrite.from}`);
  const to = quoteLiteral(rewrite.to.replace(/\/+$/, ''));
  const col = quoteIdent(c.column);
  const type = c.dataType.toLowerCase();

  const expr =
    type === 'json' || type === 'jsonb'
      ? `replace(${col}::text, ${from}, ${to})::${type}`
      : `replace(${col}, ${from}, ${to})`;

  return `update ${qualify(c)}
    set ${col} = ${expr}
    where ${col}::text like ${quoteLiteral(`%${rewrite.from}%`)}`;
}

/**
 * The whole rewrite as one transaction.
 *
 * One transaction so a failure halfway leaves nothing half-rewritten, and so
 * the whole thing can be rolled back by a person watching it. The trailing
 * verification select is what the caller asserts on: after a correct rewrite it
 * returns zero rows, and the crawlproof runbook asserted exactly that.
 */
export function rewritePlanSql(columns: ColumnRef[], rewrites: HostRewrite[]): string {
  const statements: string[] = ['begin;'];
  for (const rewrite of rewrites) {
    for (const c of columns) {
      if (!isScannable(c.dataType)) continue;
      statements.push(`${rewriteColumnSql(c, rewrite)};`);
    }
  }
  statements.push('commit;');
  return statements.join('\n');
}

/**
 * The assertion that the rewrite worked.
 *
 * Returns one row per column that still mentions an old host. Zero rows is the
 * pass condition. Run it AFTER committing: a migration that reports success
 * while rows still point at an account about to be closed is worse than one
 * that fails loudly.
 */
export function remainingMatchesSql(columns: ColumnRef[], hosts: string[]): string {
  const parts: string[] = [];
  for (const host of hosts) {
    for (const c of columns) {
      if (!isScannable(c.dataType)) continue;
      parts.push(countMatchesSql(c, host));
    }
  }
  if (!parts.length) return 'select null::text as ref, 0::bigint as n where false';

  /*
   * The union goes in a subquery and the filter is a WHERE on the outside.
   *
   * A trailing `having count(*) > 0` looks like it filters the whole thing and
   * does not: in a UNION chain it binds to the final SELECT only, so every
   * other column would be reported regardless of its count and the one real
   * offender could be buried. Filtering outside the subquery applies to all of
   * them, which is the point of the assertion.
   */
  return `select ref, n from (\n${parts.join('\nunion all\n')}\n) as remaining where n > 0 order by n desc`;
}

/**
 * Turn `--rewrite-host old=new` into a rewrite.
 *
 * Accepts a bare host on the left (`abc.supabase.co`) and a full origin on the
 * right (`https://cdn.example.com`). A missing scheme on the right is the easy
 * mistake and produces a corrupt URL rather than an error at runtime, so it is
 * rejected here.
 */
export function parseRewrite(spec: string): HostRewrite {
  const eq = spec.indexOf('=');
  if (eq < 1) {
    throw new Error(`--rewrite-host wants old-host=new-origin, got '${spec}'`);
  }
  const from = spec.slice(0, eq).trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const to = spec.slice(eq + 1).trim().replace(/\/+$/, '');

  if (!from) throw new Error(`--rewrite-host has an empty old host: '${spec}'`);
  if (!/^https?:\/\//.test(to)) {
    throw new Error(
      `--rewrite-host needs a scheme on the new origin, got '${to}'. Use https://${to}`,
    );
  }
  if (from.includes('/')) {
    throw new Error(`--rewrite-host old side should be a bare host, got '${from}'`);
  }
  return { from, to };
}
