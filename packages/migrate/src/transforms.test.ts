import { describe, expect, it } from 'vitest';
import {
  type ColumnRef,
  countMatchesSql,
  isScannable,
  parseRewrite,
  qualify,
  quoteIdent,
  quoteLiteral,
  remainingMatchesSql,
  rewriteColumnSql,
  rewritePlanSql,
} from './transforms.js';

const col = (over: Partial<ColumnRef> = {}): ColumnRef => ({
  schema: 'public',
  table: 'ad_creatives',
  column: 'image_url',
  dataType: 'text',
  ...over,
});

describe('quoting', () => {
  it('quotes an identifier so a reserved word still parses', () => {
    expect(quoteIdent('user')).toBe('"user"');
    expect(quoteIdent('order')).toBe('"order"');
  });

  it('doubles an embedded quote rather than letting it end the identifier', () => {
    expect(quoteIdent('we"ird')).toBe('"we""ird"');
  });

  it('doubles an embedded apostrophe in a literal', () => {
    expect(quoteLiteral("o'brien")).toBe("'o''brien'");
  });

  it('qualifies schema and table together', () => {
    expect(qualify(col())).toBe('"public"."ad_creatives"');
  });
});

describe('isScannable', () => {
  it('accepts the text-ish types', () => {
    for (const t of ['text', 'character varying', 'character', 'json', 'jsonb']) {
      expect(isScannable(t)).toBe(true);
    }
  });

  it('is case-insensitive', () => {
    expect(isScannable('TEXT')).toBe(true);
  });

  it('rejects types that cannot hold a URL', () => {
    for (const t of ['integer', 'boolean', 'timestamp with time zone', 'bytea']) {
      expect(isScannable(t)).toBe(false);
    }
  });
});

describe('countMatchesSql', () => {
  it('counts rows mentioning the old host', () => {
    const sql = countMatchesSql(col(), 'abc.supabase.co');
    expect(sql).toContain('"public"."ad_creatives"');
    expect(sql).toContain("'%abc.supabase.co%'");
    expect(sql).toContain('count(*)');
  });

  it('casts to text so json columns are covered by the same statement', () => {
    expect(countMatchesSql(col({ dataType: 'jsonb' }), 'h')).toContain('::text like');
  });
});

describe('rewriteColumnSql', () => {
  const rewrite = { from: 'abc.supabase.co', to: 'https://cdn.example.com' };

  it('replaces the old origin with the new one', () => {
    const sql = rewriteColumnSql(col(), rewrite);
    expect(sql).toContain(`replace("image_url", 'https://abc.supabase.co', 'https://cdn.example.com')`);
  });

  it('only touches rows that actually mention the old host', () => {
    expect(rewriteColumnSql(col(), rewrite)).toContain("like '%abc.supabase.co%'");
  });

  it('round-trips a jsonb column through text and back', () => {
    const sql = rewriteColumnSql(col({ dataType: 'jsonb' }), rewrite);
    expect(sql).toContain('::text');
    expect(sql).toContain('::jsonb');
  });

  it('strips a trailing slash off the new origin so URLs do not double up', () => {
    const sql = rewriteColumnSql(col(), { from: 'old.host', to: 'https://new.host/' });
    expect(sql).toContain("'https://new.host'");
    expect(sql).not.toContain("'https://new.host/'");
  });
});

describe('rewritePlanSql', () => {
  it('wraps every statement in one transaction', () => {
    const sql = rewritePlanSql([col()], [{ from: 'a.co', to: 'https://b.co' }]);
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
  });

  it('covers every host across every scannable column', () => {
    const sql = rewritePlanSql(
      [col(), col({ table: 'blog_posts', column: 'body' })],
      [
        { from: 'a.co', to: 'https://x.co' },
        { from: 'b.co', to: 'https://y.co' },
      ],
    );
    expect(sql.match(/update/g)).toHaveLength(4);
  });

  it('skips columns that cannot hold a URL', () => {
    const sql = rewritePlanSql(
      [col({ dataType: 'integer', column: 'views' })],
      [{ from: 'a.co', to: 'https://b.co' }],
    );
    expect(sql).not.toContain('update');
  });
});

describe('remainingMatchesSql', () => {
  it('is the post-commit assertion, and zero rows is the pass', () => {
    const sql = remainingMatchesSql([col()], ['a.co']);
    expect(sql).toContain('where n > 0');
    expect(sql).toContain('%a.co%');
  });

  it('unions every column and filters OUTSIDE the union', () => {
    // A trailing `having` would bind to the last SELECT only, so every other
    // column would report regardless of count. The filter must be outside.
    const sql = remainingMatchesSql([col(), col({ column: 'thumb_url' })], ['a.co']);
    expect(sql).toContain('union all');
    expect(sql).not.toContain('having');
    const afterSubquery = sql.slice(sql.lastIndexOf(') as remaining'));
    expect(afterSubquery).toContain('where n > 0');
  });

  it('degrades to a query returning nothing when there is nothing to check', () => {
    expect(remainingMatchesSql([], ['a.co'])).toContain('where false');
  });
});

describe('parseRewrite', () => {
  it('parses old=new', () => {
    expect(parseRewrite('abc.supabase.co=https://cdn.example.com')).toEqual({
      from: 'abc.supabase.co',
      to: 'https://cdn.example.com',
    });
  });

  it('tolerates a scheme on the old side', () => {
    expect(parseRewrite('https://abc.supabase.co=https://cdn.example.com').from).toBe(
      'abc.supabase.co',
    );
  });

  it('rejects a new origin with no scheme, which would silently corrupt URLs', () => {
    expect(() => parseRewrite('a.co=cdn.example.com')).toThrow(/needs a scheme/);
  });

  it('rejects a path on the old side', () => {
    expect(() => parseRewrite('a.co/storage=https://b.co')).toThrow(/bare host/);
  });

  it('rejects a malformed spec', () => {
    for (const bad of ['', 'nope', '=https://b.co']) {
      expect(() => parseRewrite(bad)).toThrow();
    }
  });
});
