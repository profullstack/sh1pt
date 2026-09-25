import type { Inventory, Platform, PlatformContext, Resource } from '../types.js';
import { plain, secret } from '../types.js';

/**
 * Supabase.
 *
 * A Supabase project is a Postgres with a lot bolted on, and the bolted-on
 * parts are what make migrating off it interesting. The database moves with
 * pg_dump like any other Postgres; storage is S3-compatible and moves with the
 * object-storage engine. What does not move cleanly is everything in between,
 * and the value of this inventory is naming those things up front as quirks so
 * the planner warns rather than letting them be discovered afterwards.
 *
 * The list comes from a migration that actually happened (crawlproof.com,
 * 2026-09-24): 128 tables, 113 users in `auth.users`, 204 functions, 10
 * pg_cron jobs, a realtime publication, and three public buckets holding 8,410
 * objects.
 *
 * ## The ones that bite
 *
 * `auth.users` is a real table in the dump, so users migrate — but the GoTrue
 * service that reads it does not, and neither do the JWT secrets. Restoring
 * `auth.users` somewhere with a different JWT secret logs everyone out and
 * invalidates every refresh token.
 *
 * Row Level Security policies reference roles (`authenticated`, `anon`,
 * `service_role`) that do not exist on a plain Postgres. The policies restore;
 * the roles have to be created first or every policy fails.
 *
 * pg_cron jobs restore and start running immediately, which is how a migration
 * ends up with two schedulers on one dataset.
 */

export interface SupabaseConfig {
  projectRef: string;
  /** The database password; the rest of the DSN is derived from the ref. */
  dbPassword?: string;
  /** Full DSN, when the project uses a pooler or a custom host. */
  databaseUrl?: string;
  serviceRoleKey?: string;
  /** Buckets to move. Supabase's S3 endpoint is derived from the ref. */
  buckets?: string[];
  region?: string;
}

/**
 * Supabase's direct-connection DSN for a project.
 *
 * Direct rather than the pooler: pgbouncer in transaction mode does not
 * support the session-level operations a dump and restore need, and the
 * failure is a confusing mid-dump error rather than a refusal.
 */
export function supabaseDsn(config: SupabaseConfig): string {
  if (config.databaseUrl) return config.databaseUrl;
  if (!config.dbPassword) {
    throw new Error('Supabase needs either databaseUrl or dbPassword');
  }
  const pw = encodeURIComponent(config.dbPassword);
  return `postgresql://postgres:${pw}@db.${config.projectRef}.supabase.co:5432/postgres`;
}

/** The S3-compatible storage endpoint for a project. */
export function supabaseS3Endpoint(projectRef: string): string {
  return `https://${projectRef}.supabase.co/storage/v1/s3`;
}

/** The public object host, which is what ends up embedded in rows. */
export function supabasePublicHost(projectRef: string): string {
  return `${projectRef}.supabase.co`;
}

/** What does not survive a plain pg_dump/pg_restore, named up front. */
export const SUPABASE_QUIRKS: readonly string[] = [
  'auth.users restores as data, but GoTrue and the JWT secret do not move with it: everyone is logged out and every refresh token is invalid unless the JWT secret is carried across',
  'RLS policies reference the roles anon, authenticated and service_role, which do not exist on a plain Postgres and must be created before the restore',
  'pg_cron jobs restore already enabled and begin firing immediately, so they must be disabled on the source before the cutover or two schedulers run against one dataset',
  'the realtime publication (supabase_realtime) is recreated by the dump but nothing subscribes to it without the realtime service',
  'storage.objects rows are metadata; the bytes live in the bucket and move separately',
] as const;

export const supabasePlatform: Platform<SupabaseConfig> = {
  id: 'supabase',
  label: 'Supabase',
  role: 'both',
  supports: ['postgres', 'object-storage', 'cron'],

  async inventory(ctx: PlatformContext, config: SupabaseConfig): Promise<Inventory> {
    if (!config.projectRef) throw new Error('Supabase needs a projectRef');

    const resources: Resource[] = [];

    resources.push({
      kind: 'postgres',
      id: `pg-${config.projectRef}`,
      name: 'postgres',
      connection: { url: secret(supabaseDsn(config)) },
      quirks: [...SUPABASE_QUIRKS],
      metadata: { projectRef: config.projectRef, publicHost: supabasePublicHost(config.projectRef) },
    });

    const serviceKey = config.serviceRoleKey ?? ctx.secret('SUPABASE_SERVICE_ROLE_KEY');
    for (const bucket of config.buckets ?? []) {
      if (!serviceKey) {
        throw new Error(
          `bucket '${bucket}' needs SUPABASE_SERVICE_ROLE_KEY to read Supabase storage over S3`,
        );
      }
      resources.push({
        kind: 'object-storage',
        id: `bucket-${bucket}`,
        name: bucket,
        connection: {
          bucket: plain(bucket),
          endpoint: plain(supabaseS3Endpoint(config.projectRef)),
          // Supabase's S3 gateway takes the project ref as the access key and
          // the service role key as the secret.
          accessKeyId: plain(config.projectRef),
          secretAccessKey: secret(serviceKey),
          region: plain(config.region ?? 'us-east-1'),
        },
      });
    }

    const notes = [
      `rows may hold absolute URLs to ${supabasePublicHost(config.projectRef)}; pass --rewrite-host ${supabasePublicHost(config.projectRef)}=<new origin> so they are rewritten rather than 404ing when this project is deleted`,
    ];

    ctx.log(`supabase ${config.projectRef}: ${resources.length} resource(s)`);
    return { platform: 'supabase', scope: config.projectRef, resources, notes };
  },

  async provision(_ctx: PlatformContext, resource: Resource, config: SupabaseConfig): Promise<Resource> {
    if (resource.kind === 'postgres') {
      return { ...resource, id: `pg-${config.projectRef}`, connection: { url: secret(supabaseDsn(config)) } };
    }
    if (resource.kind === 'object-storage') {
      const serviceKey = config.serviceRoleKey;
      if (!serviceKey) throw new Error('writing to Supabase storage needs a serviceRoleKey');
      return {
        ...resource,
        connection: {
          bucket: plain(resource.name),
          endpoint: plain(supabaseS3Endpoint(config.projectRef)),
          accessKeyId: plain(config.projectRef),
          secretAccessKey: secret(serviceKey),
          region: plain(config.region ?? 'us-east-1'),
        },
      };
    }
    throw new Error(`Supabase cannot receive a ${resource.kind}`);
  },

  async check(_ctx: PlatformContext, config: SupabaseConfig): Promise<void> {
    supabaseDsn(config);
  },
};
