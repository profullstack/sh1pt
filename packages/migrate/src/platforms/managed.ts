import type { Inventory, Platform, PlatformContext, Resource } from '../types.js';
import { plain, secret } from '../types.js';

/**
 * The managed database and app providers that are, from a migration's point of
 * view, a connection string with a brand on it.
 *
 * Turso, Neon, PlanetScale, Fly, Render, Heroku and Vercel differ enormously
 * as products and barely at all here: each one hands over a DSN (or a database
 * name plus a token) and the engines do the rest. Writing a file per vendor
 * would be six copies of the same twenty lines, so they share one factory and
 * differ only where they actually differ.
 *
 * That is the payoff of the platform/engine split stated concretely. Neon to
 * dedicated, dedicated to Neon, Neon to Supabase and Railway to Neon are all
 * the same two engines; none of them is a code path anyone wrote.
 */

export interface DsnConfig {
  /** The connection string. Takes precedence over anything else. */
  url?: string;
  /** Name for the resource in the plan. Defaults to the platform id. */
  name?: string;
}

export interface TursoConfig {
  database: string;
  authToken?: string;
}

interface ManagedSpec {
  id: string;
  label: string;
  kind: Resource['kind'];
  /** Environment variable holding the DSN when config does not carry it. */
  envVar: string;
  role?: Platform['role'];
  quirks?: string[];
  notes?: string[];
}

/**
 * Build a platform whose entire job is producing one connection string.
 *
 * `role` defaults to `both`: every one of these can be written to as readily
 * as read from, which is what makes the tool bidirectional without a second
 * implementation.
 */
function dsnPlatform(spec: ManagedSpec): Platform<DsnConfig> {
  return {
    id: spec.id,
    label: spec.label,
    role: spec.role ?? 'both',
    supports: [spec.kind],

    async inventory(ctx: PlatformContext, config: DsnConfig): Promise<Inventory> {
      const url = config.url ?? ctx.secret(spec.envVar);
      if (!url) {
        throw new Error(`${spec.label} needs a connection string: set ${spec.envVar} or pass url`);
      }
      const name = config.name ?? spec.id;
      return {
        platform: spec.id,
        scope: name,
        resources: [
          {
            kind: spec.kind,
            id: `${spec.id}-${name}`,
            name,
            connection: { url: secret(url) },
            ...(spec.quirks ? { quirks: [...spec.quirks] } : {}),
          },
        ],
        ...(spec.notes ? { notes: [...spec.notes] } : {}),
      };
    },

    async provision(_ctx: PlatformContext, resource: Resource, config: DsnConfig): Promise<Resource> {
      const url = config.url;
      if (!url) throw new Error(`${spec.label} target needs a connection string`);
      if (resource.kind !== spec.kind) {
        throw new Error(`${spec.label} cannot receive a ${resource.kind}`);
      }
      return { ...resource, id: `${spec.id}-${resource.name}`, connection: { url: secret(url) } };
    },

    async check(ctx: PlatformContext, config: DsnConfig): Promise<void> {
      if (!(config.url ?? ctx.secret(spec.envVar))) {
        throw new Error(`${spec.label}: no connection string (${spec.envVar})`);
      }
    },
  };
}

export const neonPlatform = dsnPlatform({
  id: 'neon',
  label: 'Neon',
  kind: 'postgres',
  envVar: 'NEON_DATABASE_URL',
  quirks: [
    'Neon branches are copy-on-write and do not survive a dump; only the branch you point at is moved',
  ],
});

export const planetscalePlatform = dsnPlatform({
  id: 'planetscale',
  label: 'PlanetScale',
  kind: 'mysql',
  envVar: 'PLANETSCALE_DATABASE_URL',
  quirks: [
    'PlanetScale does not support foreign key constraints in the usual way, so a dump taken here may restore without the constraints a plain MySQL would expect',
  ],
});

export const flyPostgresPlatform = dsnPlatform({
  id: 'fly',
  label: 'Fly.io Postgres',
  kind: 'postgres',
  envVar: 'FLY_DATABASE_URL',
  quirks: ['a Fly Postgres is reachable only over the private network unless proxied; run `fly proxy` first'],
});

export const renderPlatform = dsnPlatform({
  id: 'render',
  label: 'Render',
  kind: 'postgres',
  envVar: 'RENDER_DATABASE_URL',
});

export const herokuPlatform = dsnPlatform({
  id: 'heroku',
  label: 'Heroku Postgres',
  kind: 'postgres',
  envVar: 'HEROKU_DATABASE_URL',
  quirks: [
    'Heroku rotates DATABASE_URL without warning; resolve it at the moment of use rather than caching it across a long migration',
  ],
});

export const vercelPostgresPlatform = dsnPlatform({
  id: 'vercel',
  label: 'Vercel Postgres',
  kind: 'postgres',
  envVar: 'POSTGRES_URL',
  notes: [
    'Vercel Postgres is Neon underneath; the non-pooling POSTGRES_URL_NON_POOLING is the one a dump wants',
  ],
});

/**
 * Turso, which is the one that does not fit the DSN mould.
 *
 * Its CLI works on a database NAME plus an account token rather than a
 * connection string, so it gets a real implementation rather than a factory
 * call. The sqlite engine already knows the difference.
 */
export const tursoPlatform: Platform<TursoConfig> = {
  id: 'turso',
  label: 'Turso',
  role: 'both',
  supports: ['sqlite'],

  async inventory(ctx: PlatformContext, config: TursoConfig): Promise<Inventory> {
    if (!config.database) throw new Error('Turso needs a database name');
    const token = config.authToken ?? ctx.secret('TURSO_API_TOKEN');
    if (!token) throw new Error('Turso needs TURSO_API_TOKEN');

    return {
      platform: 'turso',
      scope: config.database,
      resources: [
        {
          kind: 'sqlite',
          id: `turso-${config.database}`,
          name: config.database,
          connection: { tursoDatabase: plain(config.database), authToken: secret(token) },
          metadata: { platform: 'turso' },
          quirks: [
            'embedded replicas and their sync state do not move; only the primary database is dumped',
          ],
        },
      ],
    };
  },

  async provision(ctx: PlatformContext, resource: Resource, config: TursoConfig): Promise<Resource> {
    if (resource.kind !== 'sqlite') throw new Error(`Turso cannot receive a ${resource.kind}`);
    const token = config.authToken ?? ctx.secret('TURSO_API_TOKEN');
    if (!token) throw new Error('Turso needs TURSO_API_TOKEN');
    return {
      ...resource,
      id: `turso-${config.database}`,
      connection: { tursoDatabase: plain(config.database), authToken: secret(token) },
      metadata: { ...resource.metadata, platform: 'turso' },
    };
  },

  async check(ctx: PlatformContext, config: TursoConfig): Promise<void> {
    if (!(config.authToken ?? ctx.secret('TURSO_API_TOKEN'))) {
      throw new Error('Turso: no TURSO_API_TOKEN');
    }
  },
};

export const MANAGED_PLATFORMS = [
  neonPlatform,
  planetscalePlatform,
  flyPostgresPlatform,
  renderPlatform,
  herokuPlatform,
  vercelPostgresPlatform,
] as const;
