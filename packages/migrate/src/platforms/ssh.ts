import type { Inventory, Platform, PlatformContext, Resource, Secretish } from '../types.js';
import { plain, secret } from '../types.js';

/**
 * A box you own: a VPS, a dedicated server, the thing at the other end of an
 * ssh config entry.
 *
 * This is the platform every "get off the cloud" migration ends at, and the
 * one every "we need managed after all" migration starts from. It is `both`
 * because those are the same code path, which is the entire point of splitting
 * platforms from engines.
 *
 * Unlike a managed provider there is no API to ask what is here, so a box is
 * described rather than discovered. That is not a workaround: a directory on a
 * server has no metadata saying "this is the uploads volume", and guessing
 * from paths would be worse than being told. The description lives in config,
 * which means it is reviewable and it is the same on every run.
 */

export interface SshConfig {
  host: string;
  user?: string;
  sshKeyPath?: string;
  sshPort?: string;
  /** Databases reachable from this box, usually on loopback. */
  postgres?: Array<{ name: string; url: string }>;
  sqlite?: Array<{ name: string; path: string }>;
  redis?: Array<{ name: string; url: string; dataDir?: string }>;
  /** Directories to move: volumes, docroots, upload trees. */
  files?: Array<{ name: string; path: string }>;
  /** An S3-compatible endpoint running on the box, e.g. MinIO. */
  buckets?: Array<{
    name: string;
    bucket: string;
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    region?: string;
  }>;
}

export const sshPlatform: Platform<SshConfig> = {
  id: 'ssh',
  label: 'dedicated / VPS over ssh',
  role: 'both',
  supports: ['postgres', 'sqlite', 'redis', 'files', 'object-storage'],

  async inventory(ctx: PlatformContext, config: SshConfig): Promise<Inventory> {
    if (!config.host) throw new Error('ssh platform needs a host');

    const resources: Resource[] = [];
    const notes: string[] = [];

    for (const db of config.postgres ?? []) {
      resources.push({
        kind: 'postgres',
        id: `pg-${db.name}`,
        name: db.name,
        connection: { url: secret(db.url) },
      });
    }

    for (const db of config.sqlite ?? []) {
      resources.push({
        kind: 'sqlite',
        id: `sqlite-${db.name}`,
        name: db.name,
        connection: { path: plain(db.path) },
      });
    }

    for (const r of config.redis ?? []) {
      resources.push({
        kind: 'redis',
        id: `redis-${r.name}`,
        name: r.name,
        connection: {
          url: secret(r.url),
          ...(r.dataDir ? { dataDir: plain(r.dataDir) } : {}),
        },
      });
    }

    for (const dir of config.files ?? []) {
      resources.push({
        kind: 'files',
        id: `files-${dir.name}`,
        name: dir.name,
        connection: {
          path: plain(dir.path),
          host: plain(config.host),
          ...(config.user ? { user: plain(config.user) } : {}),
          ...(config.sshKeyPath ? { sshKeyPath: plain(config.sshKeyPath) } : {}),
          ...(config.sshPort ? { sshPort: plain(config.sshPort) } : {}),
        },
      });
    }

    for (const b of config.buckets ?? []) {
      resources.push({
        kind: 'object-storage',
        id: `bucket-${b.name}`,
        name: b.name,
        connection: {
          bucket: plain(b.bucket),
          endpoint: plain(b.endpoint),
          accessKeyId: secret(b.accessKeyId),
          secretAccessKey: secret(b.secretAccessKey),
          ...(b.region ? { region: plain(b.region) } : {}),
        },
      });
    }

    if (!resources.length) {
      notes.push(
        'Nothing is declared for this box. A server has no API to enumerate itself, so its databases and directories have to be listed in config.',
      );
    }

    ctx.log(`${config.host}: ${resources.length} declared resource(s)`);
    return { platform: 'ssh', scope: config.host, resources, notes };
  },

  /**
   * The target side of a move onto a box.
   *
   * A resource arriving here keeps its name and gets this box's connection
   * details. Nothing is created remotely: the database or directory is
   * expected to exist, because provisioning a Postgres on someone's server is
   * a decision about disks and versions and backups that a migration tool
   * should not be quietly making.
   */
  async provision(ctx: PlatformContext, resource: Resource, config: SshConfig): Promise<Resource> {
    const match = ((): Record<string, Secretish> | undefined => {
      switch (resource.kind) {
        case 'postgres': {
          const db = config.postgres?.find((d) => d.name === resource.name) ?? config.postgres?.[0];
          return db ? { url: secret(db.url) } : undefined;
        }
        case 'sqlite': {
          const db = config.sqlite?.find((d) => d.name === resource.name) ?? config.sqlite?.[0];
          return db ? { path: plain(db.path) } : undefined;
        }
        case 'redis': {
          const r = config.redis?.find((d) => d.name === resource.name) ?? config.redis?.[0];
          return r
            ? { url: secret(r.url), ...(r.dataDir ? { dataDir: plain(r.dataDir) } : {}) }
            : undefined;
        }
        case 'files': {
          const d = config.files?.find((x) => x.name === resource.name) ?? config.files?.[0];
          return d
            ? {
                path: plain(d.path),
                host: plain(config.host),
                ...(config.user ? { user: plain(config.user) } : {}),
                ...(config.sshKeyPath ? { sshKeyPath: plain(config.sshKeyPath) } : {}),
                ...(config.sshPort ? { sshPort: plain(config.sshPort) } : {}),
              }
            : undefined;
        }
        case 'object-storage': {
          const b = config.buckets?.find((x) => x.name === resource.name) ?? config.buckets?.[0];
          return b
            ? {
                bucket: plain(b.bucket),
                endpoint: plain(b.endpoint),
                accessKeyId: secret(b.accessKeyId),
                secretAccessKey: secret(b.secretAccessKey),
                ...(b.region ? { region: plain(b.region) } : {}),
              }
            : undefined;
        }
        default:
          return undefined;
      }
    })();

    if (!match) {
      throw new Error(
        `nothing on ${config.host} is declared to receive ${resource.kind} '${resource.name}'. Add it to the target config.`,
      );
    }

    ctx.log(`${resource.name} → ${config.host}`);
    return { ...resource, id: `${resource.id}@${config.host}`, connection: match };
  },

  async check(ctx: PlatformContext, config: SshConfig): Promise<void> {
    if (!config.host) throw new Error('ssh platform needs a host');
    ctx.log(`target box is ${config.user ? `${config.user}@` : ''}${config.host}`);
  },
};
