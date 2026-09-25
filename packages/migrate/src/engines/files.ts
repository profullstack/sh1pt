import type { Artifact, Engine, EngineContext, Resource, VerifyResult } from '../types.js';

/**
 * Moving a directory of files — a mounted volume, an uploads directory, a
 * docroot.
 *
 * This is the engine for the thing that is not a database and not a bucket:
 * Railway volumes, Fly volumes, and `~/www/<domain>` on a dedicated box. rsync
 * does it because rsync is what does this, and because its delta algorithm
 * makes the second pass — the one during the cutover window — proportional to
 * what changed rather than to the size of the tree.
 *
 * As with object storage, `--delete` is never passed. rsync's delete is the
 * single most effective way to destroy a directory by typing the wrong target,
 * and a migration has no reason to remove anything.
 */

/**
 * `[user@host:]/path/` as rsync wants it.
 *
 * The trailing slash is always present and always matters: with it rsync
 * copies the CONTENTS of the directory, without it it nests the directory
 * inside the destination, producing `~/www/app/app/` — which looks from the
 * outside like the copy silently did nothing.
 */
export function endpoint(r: Resource): string {
  const path = r.connection.path?.reveal();
  if (!path) throw new Error(`files resource '${r.name}' has no connection.path`);
  const withSlash = `${path.replace(/\/*$/, '')}/`;
  const host = r.connection.host?.reveal();
  if (!host) return withSlash;
  const user = r.connection.user?.reveal();
  return `${user ? `${user}@` : ''}${host}:${withSlash}`;
}

export function isRemote(r: Resource): boolean {
  return Boolean(r.connection.host);
}

/**
 * rsync cannot copy remote to remote.
 *
 * It is a hard limitation of the protocol, not a flag that was missed: one
 * side must be local. A VPS-to-VPS move therefore has to relay through the
 * machine running the migration, which is a real cost (the bytes cross the
 * wire twice) and needs to be said out loud rather than discovered when rsync
 * exits with "The source and destination cannot both be remote."
 */
export function assertCopyable(from: Resource, to: Resource): void {
  if (isRemote(from) && isRemote(to)) {
    throw new Error(
      `rsync cannot copy directly between two remote hosts (${from.name} → ${to.name}). Run the migration from one of them, or stage the directory locally first.`,
    );
  }
}

/** The ssh transport, including a key when one is configured. */
function rsyncTransport(r: Resource): string[] {
  const key = r.connection.sshKeyPath?.reveal();
  const port = r.connection.sshPort?.reveal();
  if (!r.connection.host) return [];
  const parts = ['ssh', '-o', 'BatchMode=yes'];
  if (key) parts.push('-i', key);
  if (port) parts.push('-p', port);
  return ['-e', parts.join(' ')];
}

export const filesEngine: Engine = {
  kind: 'files',
  requires: ['rsync'],

  /**
   * Nothing is staged: like object storage, files go host to host. The export
   * records what is there so `verify` has something to compare and so a plan
   * can show a size.
   */
  async export(ctx: EngineContext, from: Resource): Promise<Artifact[]> {
    const path = `${from.id}/files.manifest`;
    if (ctx.dryRun) return [{ resourceId: from.id, kind: 'files', path }];

    const res = await ctx.exec(
      'rsync',
      [...rsyncTransport(from), '--dry-run', '--archive', '--stats', endpoint(from), '/dev/null'],
      { check: false },
    );

    const files = /Number of files: ([\d,]+)/.exec(res.stdout)?.[1]?.replace(/,/g, '');
    const artifact: Artifact = {
      resourceId: from.id,
      kind: 'files',
      path,
      metadata: { fileCount: files ? Number(files) : 0 },
    };
    await ctx.staging.record(artifact);
    return [artifact];
  },

  async import(ctx: EngineContext, to: Resource, _artifacts: Artifact[], from?: Resource): Promise<void> {
    if (!from) throw new Error('files import needs the source resource: files are copied host to host');
    assertCopyable(from, to);

    if (ctx.dryRun) {
      ctx.log(`would rsync ${endpoint(from)} → ${endpoint(to)}`);
      return;
    }

    await ctx.exec(
      'rsync',
      [
        ...rsyncTransport(isRemote(from) ? from : to),
        '--archive',
        '--compress',
        '--partial',
        '--human-readable',
        endpoint(from),
        endpoint(to),
      ],
      { timeoutMs: 12 * 60 * 60 * 1000 },
    );
  },

  /** The second pass, during the cutover window: only what changed. */
  async delta(ctx: EngineContext, from: Resource, _since: Date): Promise<Artifact[]> {
    const path = `${from.id}/files.delta`;
    if (ctx.dryRun) return [{ resourceId: from.id, kind: 'files', path }];
    // rsync compares by size and mtime on its own, so the delta pass is the
    // same command. It is fast because almost nothing has changed.
    const artifact: Artifact = { resourceId: from.id, kind: 'files', path, metadata: { mode: 'delta' } };
    await ctx.staging.record(artifact);
    return [artifact];
  },

  async verify(ctx: EngineContext, from: Resource, to: Resource): Promise<VerifyResult> {
    if (ctx.dryRun) return { ok: true, checks: ['dry run: not compared'], problems: [] };

    // A dry-run rsync from source to target lists exactly what still differs.
    // Zero transfers is the pass condition.
    const res = await ctx.exec(
      'rsync',
      [
        ...rsyncTransport(isRemote(from) ? from : to),
        '--dry-run',
        '--archive',
        '--itemize-changes',
        endpoint(from),
        endpoint(to),
      ],
      { check: false },
    );

    const differing = res.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    return {
      ok: differing.length === 0,
      checks: [`${differing.length} path(s) still differ`],
      problems: differing.slice(0, 20),
    };
  },
};
