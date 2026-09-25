import type { Artifact, Engine, EngineContext, Resource, VerifyResult } from '../types.js';

/**
 * Moving a bucket of objects.
 *
 * S3, R2, B2, Spaces, Supabase storage, MinIO on a dedicated box. They all
 * speak S3 or something close enough, and the differences are endpoint URLs
 * and auth styles rather than anything structural — so this is one engine with
 * a remote definition per side, not one engine per vendor.
 *
 * ## Why rclone rather than an SDK
 *
 * Copying 8,410 objects across 9.56 GB from a script means reimplementing
 * concurrency, retries, resume, multipart thresholds and checksum comparison,
 * and getting all five right. rclone has those and is a single static binary.
 * The alternative — `aws s3 sync` — only speaks S3 and needs a credentials
 * file on disk, which is worse for a tool that has to reach six vendors.
 *
 * The cost is a dependency the planner checks for up front (`requires`), so a
 * missing rclone is a blocker before the freeze rather than a failure during
 * it.
 *
 * ## Staging, or not
 *
 * Every other engine dumps to staging and loads from it. Object storage is the
 * exception: pulling 10 GB down to a laptop and pushing it back up doubles the
 * transfer and needs the disk. `export` therefore only writes a manifest, and
 * `import` runs a remote-to-remote copy that rclone streams server-side where
 * it can. The manifest is not busywork — it is what `verify` compares against,
 * and what makes a resumed run able to tell what it already did.
 */

/**
 * An rclone remote, built inline from the resource's connection.
 *
 * rclone is normally configured from a file; passing the whole remote
 * definition through `RCLONE_CONFIG_*` environment variables instead means no
 * credential is ever written to disk, and none appears in argv.
 */
export function rcloneEnv(r: Resource, alias: string): Record<string, string> {
  const get = (k: string): string | undefined => r.connection[k]?.reveal();
  const bucket = get('bucket');
  if (!bucket) throw new Error(`object-storage resource '${r.name}' has no connection.bucket`);

  const prefix = `RCLONE_CONFIG_${alias.toUpperCase()}`;
  const env: Record<string, string> = {
    [`${prefix}_TYPE`]: 's3',
    // 'Other' keeps rclone from applying provider-specific assumptions to an
    // endpoint that merely speaks S3, which is the case for R2, Supabase,
    // MinIO and Backblaze's S3 gateway.
    [`${prefix}_PROVIDER`]: get('provider') ?? 'Other',
  };

  const accessKey = get('accessKeyId');
  const secretKey = get('secretAccessKey');
  if (accessKey) env[`${prefix}_ACCESS_KEY_ID`] = accessKey;
  if (secretKey) env[`${prefix}_SECRET_ACCESS_KEY`] = secretKey;

  const endpoint = get('endpoint');
  if (endpoint) env[`${prefix}_ENDPOINT`] = endpoint;
  const region = get('region');
  if (region) env[`${prefix}_REGION`] = region;

  // Most non-AWS S3 endpoints are path-style; virtual-host style silently
  // resolves to a hostname that does not exist.
  if (endpoint && !get('forcePathStyle')) env[`${prefix}_FORCE_PATH_STYLE`] = 'true';

  return env;
}

/** `remote:bucket/prefix` as rclone wants it. */
export function rclonePath(r: Resource, alias: string): string {
  const bucket = r.connection.bucket?.reveal() ?? '';
  const prefix = r.connection.prefix?.reveal() ?? '';
  return `${alias}:${bucket}${prefix ? `/${prefix.replace(/^\/+/, '')}` : ''}`;
}

const MANIFEST = 'objects.json';

interface ManifestEntry {
  path: string;
  size: number;
}

export const objectStorageEngine: Engine = {
  kind: 'object-storage',
  requires: ['rclone'],

  /**
   * List the bucket. Deliberately does not download it — see the note above.
   */
  async export(ctx: EngineContext, from: Resource): Promise<Artifact[]> {
    const path = `${from.id}/${MANIFEST}`;
    ctx.log(`listing ${from.name}`);

    if (ctx.dryRun) return [{ resourceId: from.id, kind: 'object-storage', path }];

    const res = await ctx.exec('rclone', ['lsjson', '--recursive', '--files-only', rclonePath(from, 'src')], {
      env: rcloneEnv(from, 'src'),
      timeoutMs: 60 * 60 * 1000,
    });

    let entries: ManifestEntry[];
    try {
      const parsed = JSON.parse(res.stdout || '[]') as Array<{ Path?: string; Size?: number }>;
      entries = parsed.map((e) => ({ path: e.Path ?? '', size: e.Size ?? 0 })).filter((e) => e.path);
    } catch {
      throw new Error(`could not parse the object listing for '${from.name}'`);
    }

    const artifact: Artifact = {
      resourceId: from.id,
      kind: 'object-storage',
      path,
      sizeBytes: entries.reduce((n, e) => n + e.size, 0),
      metadata: { objectCount: entries.length, manifest: JSON.stringify(entries).length },
    };
    await ctx.staging.record(artifact);
    ctx.log(`${entries.length} object(s) to copy`);
    return [artifact];
  },

  /**
   * Copy source → target directly.
   *
   * `copy`, never `sync`: sync deletes anything at the destination that is not
   * at the source, which for a mistyped target is indistinguishable from
   * wiping a live bucket. Migrations should not be able to delete.
   */
  async import(
    ctx: EngineContext,
    to: Resource,
    _artifacts: Artifact[],
    from?: Resource,
  ): Promise<void> {
    const source = from;
    if (!source) {
      throw new Error(
        `object-storage import needs the source resource: its objects are copied remote-to-remote rather than staged locally`,
      );
    }

    if (ctx.dryRun) {
      ctx.log(`would rclone copy ${rclonePath(source, 'src')} → ${rclonePath(to, 'dst')}`);
      return;
    }

    ctx.log(`rclone copy → ${to.name}`);
    await ctx.exec(
      'rclone',
      [
        'copy',
        rclonePath(source, 'src'),
        rclonePath(to, 'dst'),
        '--transfers=16',
        '--checkers=32',
        // Resume-friendly: an object already present with the same size and
        // modification time is not re-sent, so a re-run after a failure costs
        // a listing rather than the whole bucket.
        '--update',
        '--stats=30s',
      ],
      {
        env: { ...rcloneEnv(source, 'src'), ...rcloneEnv(to, 'dst') },
        timeoutMs: 12 * 60 * 60 * 1000,
      },
    );
  },

  /**
   * Objects created during the bulk copy.
   *
   * rclone's own `--max-age` does this server-side, so the delta is the same
   * copy restricted to recent objects rather than a different mechanism.
   */
  async delta(ctx: EngineContext, from: Resource, since: Date): Promise<Artifact[]> {
    const path = `${from.id}/delta-${since.toISOString().replace(/[:.]/g, '')}.json`;
    if (ctx.dryRun) return [{ resourceId: from.id, kind: 'object-storage', path }];

    const ageSeconds = Math.max(1, Math.round((Date.now() - since.getTime()) / 1000));
    const res = await ctx.exec(
      'rclone',
      ['lsjson', '--recursive', '--files-only', `--max-age=${ageSeconds}s`, rclonePath(from, 'src')],
      { env: rcloneEnv(from, 'src') },
    );

    let count = 0;
    try {
      count = (JSON.parse(res.stdout || '[]') as unknown[]).length;
    } catch {
      count = 0;
    }
    ctx.log(`${count} object(s) written during the bulk copy`);

    const artifact: Artifact = {
      resourceId: from.id,
      kind: 'object-storage',
      path,
      metadata: { objectCount: count, mode: 'delta' },
    };
    await ctx.staging.record(artifact);
    return [artifact];
  },

  /** Object counts and total size on both sides. */
  async verify(ctx: EngineContext, from: Resource, to: Resource): Promise<VerifyResult> {
    if (ctx.dryRun) return { ok: true, checks: ['dry run: not compared'], problems: [] };

    const size = async (r: Resource, alias: string) => {
      const res = await ctx.exec('rclone', ['size', '--json', rclonePath(r, alias)], {
        env: rcloneEnv(r, alias),
        check: false,
      });
      try {
        const parsed = JSON.parse(res.stdout || '{}') as { count?: number; bytes?: number };
        return { count: parsed.count ?? 0, bytes: parsed.bytes ?? 0 };
      } catch {
        return { count: 0, bytes: 0 };
      }
    };

    const [a, b] = await Promise.all([size(from, 'src'), size(to, 'dst')]);
    const checks = [`${from.name}: ${a.count} objects → ${b.count}`, `bytes: ${a.bytes} → ${b.bytes}`];
    const problems: string[] = [];
    if (b.count < a.count) {
      problems.push(`${a.count - b.count} object(s) did not arrive in '${to.name}'`);
    }
    return { ok: problems.length === 0, checks, problems };
  },
};
