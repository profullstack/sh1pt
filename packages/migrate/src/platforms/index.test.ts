import { describe, expect, it } from 'vitest';
import { PLATFORMS, compatibleKinds, platformById, sources, targets } from './index.js';
import { classifyConnection, connectionsFromVariables } from './railway.js';
import {
  SUPABASE_QUIRKS,
  supabaseDsn,
  supabasePlatform,
  supabasePublicHost,
  supabaseS3Endpoint,
} from './supabase.js';
import { sshPlatform } from './ssh.js';
import { tursoPlatform } from './managed.js';
import type { PlatformContext } from '../types.js';

const ctx = (secrets: Record<string, string> = {}): PlatformContext => ({
  secret: (k) => secrets[k],
  log: () => {},
  dryRun: false,
});

describe('the platform registry', () => {
  it('gives every platform a unique id', () => {
    const ids = PLATFORMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares at least one resource kind per platform', () => {
    for (const p of PLATFORMS) expect(p.supports.length).toBeGreaterThan(0);
  });

  it('gives every target a way to resolve an incoming resource', () => {
    for (const p of PLATFORMS) {
      if (p.role === 'source') continue;
      expect(typeof p.provision === 'function' || p.id === 'railway').toBe(true);
    }
  });

  it('finds a platform by id', () => {
    expect(platformById('supabase')?.label).toBe('Supabase');
    expect(platformById('nope')).toBeUndefined();
  });

  it('lists sources and targets separately', () => {
    expect(sources().length).toBeGreaterThan(0);
    expect(targets().length).toBeGreaterThan(0);
  });
});

describe('compatibleKinds is what makes direction a non-question', () => {
  it('finds postgres in both directions between Supabase and a box', () => {
    expect(compatibleKinds('supabase', 'ssh')).toContain('postgres');
    expect(compatibleKinds('ssh', 'supabase')).toContain('postgres');
  });

  it('moves MySQL off PlanetScale onto a box, which is the get-off-the-cloud case', () => {
    expect(compatibleKinds('planetscale', 'ssh')).toEqual(['mysql']);
    expect(compatibleKinds('ssh', 'planetscale')).toEqual(['mysql']);
  });

  it('pairs Turso with a box over sqlite, both ways', () => {
    expect(compatibleKinds('turso', 'ssh')).toEqual(['sqlite']);
    expect(compatibleKinds('ssh', 'turso')).toEqual(['sqlite']);
  });

  it('reports an empty intersection rather than pretending a migration is possible', () => {
    // Turso holds sqlite; Neon accepts only postgres.
    expect(compatibleKinds('turso', 'neon')).toEqual([]);
  });

  it('is empty for an unknown platform', () => {
    expect(compatibleKinds('turso', 'nope')).toEqual([]);
  });
});

describe('railway connection discovery', () => {
  it('classifies by scheme, not by variable name', () => {
    expect(classifyConnection('postgresql://u@h/d')).toBe('postgres');
    expect(classifyConnection('postgres://u@h/d')).toBe('postgres');
    expect(classifyConnection('mysql://u@h/d')).toBe('mysql');
    expect(classifyConnection('redis://h:6379')).toBe('redis');
    expect(classifyConnection('rediss://h:6379')).toBe('redis');
    expect(classifyConnection('libsql://x.turso.io')).toBe('sqlite');
  });

  it('ignores a variable that is not a connection string', () => {
    expect(classifyConnection('production')).toBeUndefined();
    expect(classifyConnection('https://example.com')).toBeUndefined();
  });

  it('finds a database under a non-standard variable name', () => {
    const found = connectionsFromVariables([
      { name: 'NODE_ENV', value: 'production' },
      { name: 'PG_URI', value: 'postgres://u@h/d' },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe('postgres');
  });

  it('moves a database once even when several services share it', () => {
    const found = connectionsFromVariables([
      { name: 'DATABASE_URL', value: 'postgres://u@h/d' },
      { name: 'DATABASE_URL', value: 'postgres://u@h/d' },
      { name: 'PG_URL', value: 'postgres://u@h/d' },
    ]);
    expect(found).toHaveLength(1);
  });
});

describe('supabase', () => {
  it('builds the direct DSN, not the pooler, which cannot serve a dump', () => {
    const dsn = supabaseDsn({ projectRef: 'abc123', dbPassword: 'pw' });
    expect(dsn).toContain('db.abc123.supabase.co:5432');
  });

  it('url-encodes a password with reserved characters', () => {
    expect(supabaseDsn({ projectRef: 'r', dbPassword: 'p@ss/word' })).toContain('p%40ss%2Fword');
  });

  it('prefers an explicit databaseUrl', () => {
    expect(supabaseDsn({ projectRef: 'r', databaseUrl: 'postgres://custom/h' })).toBe(
      'postgres://custom/h',
    );
  });

  it('refuses when it has neither', () => {
    expect(() => supabaseDsn({ projectRef: 'r' })).toThrow(/databaseUrl or dbPassword/);
  });

  it('derives the s3 endpoint and the public host', () => {
    expect(supabaseS3Endpoint('abc')).toBe('https://abc.supabase.co/storage/v1/s3');
    expect(supabasePublicHost('abc')).toBe('abc.supabase.co');
  });

  it('names the things a pg_dump does not carry', async () => {
    const inv = await supabasePlatform.inventory(ctx(), { projectRef: 'abc', dbPassword: 'pw' });
    const quirks = inv.resources[0]?.quirks ?? [];
    expect(quirks).toEqual([...SUPABASE_QUIRKS]);
    expect(quirks.some((q) => /JWT/.test(q))).toBe(true);
    expect(quirks.some((q) => /pg_cron/.test(q))).toBe(true);
    expect(quirks.some((q) => /anon, authenticated/.test(q))).toBe(true);
  });

  it('tells you to rewrite its public host before the project is deleted', async () => {
    const inv = await supabasePlatform.inventory(ctx(), { projectRef: 'abc', dbPassword: 'pw' });
    expect(inv.notes?.[0]).toContain('--rewrite-host abc.supabase.co=');
  });

  it('refuses a bucket with no service role key', async () => {
    await expect(
      supabasePlatform.inventory(ctx(), { projectRef: 'abc', dbPassword: 'pw', buckets: ['ads'] }),
    ).rejects.toThrow(/SERVICE_ROLE_KEY/);
  });

  it('builds an s3 connection for a bucket when the key is present', async () => {
    const inv = await supabasePlatform.inventory(ctx({ SUPABASE_SERVICE_ROLE_KEY: 'svc' }), {
      projectRef: 'abc',
      dbPassword: 'pw',
      buckets: ['ads'],
    });
    const bucket = inv.resources.find((r) => r.kind === 'object-storage');
    expect(bucket?.connection.endpoint?.reveal()).toBe('https://abc.supabase.co/storage/v1/s3');
    expect(bucket?.connection.secretAccessKey?.describe()).not.toContain('svc');
  });
});

describe('ssh', () => {
  it('describes a box from config, since a server has no API to enumerate itself', async () => {
    const inv = await sshPlatform.inventory(ctx(), {
      host: 'dev2.example.com',
      user: 'anthony',
      postgres: [{ name: 'app', url: 'postgres://u@localhost/app' }],
      files: [{ name: 'www', path: '/home/anthony/www' }],
    });
    expect(inv.resources.map((r) => r.kind).sort()).toEqual(['files', 'postgres']);
    expect(inv.scope).toBe('dev2.example.com');
  });

  it('carries ssh details onto file resources so rsync can reach them', async () => {
    const inv = await sshPlatform.inventory(ctx(), {
      host: 'h',
      user: 'u',
      sshKeyPath: '/k',
      files: [{ name: 'www', path: '/w' }],
    });
    const files = inv.resources[0]!;
    expect(files.connection.host?.reveal()).toBe('h');
    expect(files.connection.sshKeyPath?.reveal()).toBe('/k');
  });

  it('says so when nothing is declared, rather than reporting an empty box', async () => {
    const inv = await sshPlatform.inventory(ctx(), { host: 'h' });
    expect(inv.notes?.[0]).toMatch(/no API to enumerate itself/);
  });

  it('resolves an incoming resource against the declared target', async () => {
    const out = await sshPlatform.provision(
      ctx(),
      { kind: 'postgres', id: 'pg', name: 'app', connection: {} },
      { host: 'h', postgres: [{ name: 'app', url: 'postgres://u@localhost/app' }] },
    );
    expect(out.connection.url?.reveal()).toContain('localhost/app');
  });

  it('refuses when the target declares nowhere to put it', async () => {
    await expect(
      sshPlatform.provision(ctx(), { kind: 'postgres', id: 'pg', name: 'app', connection: {} }, { host: 'h' }),
    ).rejects.toThrow(/nothing on h is declared/);
  });

  it('needs a host', async () => {
    await expect(sshPlatform.inventory(ctx(), { host: '' })).rejects.toThrow(/needs a host/);
  });
});

describe('turso', () => {
  it('works on a database name plus a token rather than a DSN', async () => {
    const inv = await tursoPlatform.inventory(ctx({ TURSO_API_TOKEN: 'tok' }), { database: 'prod' });
    expect(inv.resources[0]?.connection.tursoDatabase?.reveal()).toBe('prod');
    expect(inv.resources[0]?.metadata?.platform).toBe('turso');
  });

  it('refuses without a token', async () => {
    await expect(tursoPlatform.inventory(ctx(), { database: 'prod' })).rejects.toThrow(/TURSO_API_TOKEN/);
  });

  it('can also receive, which is what makes dedicated→Turso possible', async () => {
    const out = await tursoPlatform.provision!(
      ctx({ TURSO_API_TOKEN: 'tok' }),
      { kind: 'sqlite', id: 'x', name: 'app', connection: {} },
      { database: 'restored' },
    );
    expect(out.connection.tursoDatabase?.reveal()).toBe('restored');
  });
});
