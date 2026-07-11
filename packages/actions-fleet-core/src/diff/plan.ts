import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, isAbsolute, normalize, sep } from 'node:path';
import type { PlannedFile, RenderResult } from '../action-pack/render.js';

export type DiffStatus =
  | { kind: 'create' }
  | { kind: 'unchanged'; existingPackId: string; existingPackVersion: string }
  | { kind: 'update-managed'; existingPackId: string; existingPackVersion: string }
  | { kind: 'conflict-unmanaged' }
  | { kind: 'conflict-other-pack'; existingPackId: string; existingPackVersion: string };

export interface PlannedFileDiff {
  destination: string;
  absolutePath: string;
  source: string;
  mergeStrategy: PlannedFile['mergeStrategy'];
  newContent: string;
  newHash: string;
  status: DiffStatus;
}

export interface DiffPlan {
  packId: string;
  packVersion: string;
  repoDir: string;
  files: PlannedFileDiff[];
}

export interface PlanDiffOptions {
  /** Absolute path of the repo root where files would be written. */
  repoDir: string;
  /** Renderer output to compare against the filesystem. */
  render: RenderResult;
  /**
   * Override the file-read step (used by tests). Returns the file contents
   * or null if the file does not exist.
   */
  readExisting?: (absolutePath: string) => Promise<string | null>;
}

export class UnsafeRepoPathError extends Error {
  constructor(destination: string) {
    super(`unsafe destination path "${destination}"`);
    this.name = 'UnsafeRepoPathError';
  }
}

function resolveSafeRepoPath(repoDir: string, destination: string): string {
  if (!isAbsolute(repoDir)) {
    throw new Error(`repoDir must be absolute, got "${repoDir}"`);
  }
  assertSafeDestination(destination);
  const absolute = normalize(join(repoDir, destination));
  const repoWithSep = repoDir.endsWith(sep) ? repoDir : `${repoDir}${sep}`;
  if (!absolute.startsWith(repoWithSep) && absolute !== repoDir) {
    throw new UnsafeRepoPathError(destination);
  }
  return absolute;
}

function assertSafeDestination(destination: string): void {
  if (isAbsolute(destination)) throw new UnsafeRepoPathError(destination);
  if (destination.startsWith('/')) throw new UnsafeRepoPathError(destination);
  if (destination.includes('\0')) throw new UnsafeRepoPathError(destination);
  const normalized = normalize(destination);
  if (normalized === '..' || normalized.startsWith(`..${sep}`) || normalized.includes(`${sep}..${sep}`)) {
    throw new UnsafeRepoPathError(destination);
  }
}

async function defaultReadExisting(absolutePath: string): Promise<string | null> {
  try {
    return await readFile(absolutePath, 'utf8');
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

interface ManagedHeader {
  packId: string;
  packVersion: string;
  bodyHash: string;
}

const HEADER_PACK_RE = /^# pack:\s*([a-z0-9-]+)@(\S+)\s*$/;
const HEADER_HASH_RE = /^# hash:\s*sha256:([a-f0-9]{64})\s*$/;
const HEADER_MARKER = '# Managed by sh1pt Actions Fleet';

export function parseManagedHeader(content: string): ManagedHeader | null {
  const lines = content.split('\n', 8);
  if (lines[0]?.trim() !== HEADER_MARKER) return null;
  let packId: string | undefined;
  let packVersion: string | undefined;
  let bodyHash: string | undefined;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const pm = HEADER_PACK_RE.exec(line);
    if (pm) {
      packId = pm[1];
      packVersion = pm[2];
      continue;
    }
    const hm = HEADER_HASH_RE.exec(line);
    if (hm) {
      bodyHash = hm[1];
      continue;
    }
    if (line === '') break;
  }
  if (!packId || !packVersion || !bodyHash) return null;
  return { packId, packVersion, bodyHash };
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Compute the body hash of an existing managed file. Mirrors the renderer
 * (`buildManagedHeader` in action-pack/render.ts), which emits the marker,
 * `# pack:`, `# install:` and `# hash:` lines separated by single newlines
 * and then the body immediately after the `# hash:` line's newline — there is
 * no blank line between the header and the body. Strip through that `# hash:`
 * line and hash whatever remains.
 */
function existingBodyHash(content: string): string | null {
  if (!content.startsWith(HEADER_MARKER)) return null;
  const hashAt = content.indexOf('\n# hash:');
  if (hashAt < 0) return null;
  const afterHashLine = content.indexOf('\n', hashAt + 1);
  if (afterHashLine < 0) return null;
  const body = content.slice(afterHashLine + 1);
  return sha256(body);
}

export async function planDiff(options: PlanDiffOptions): Promise<DiffPlan> {
  const { repoDir, render } = options;
  const read = options.readExisting ?? defaultReadExisting;
  const files: PlannedFileDiff[] = [];

  for (const file of render.files) {
    const absolutePath = resolveSafeRepoPath(repoDir, file.destination);
    const existing = await read(absolutePath);

    let status: DiffStatus;
    if (existing === null) {
      status = { kind: 'create' };
    } else {
      const header = parseManagedHeader(existing);
      if (!header) {
        status = { kind: 'conflict-unmanaged' };
      } else if (header.packId !== render.packId) {
        status = {
          kind: 'conflict-other-pack',
          existingPackId: header.packId,
          existingPackVersion: header.packVersion,
        };
      } else {
        const bodyHash = existingBodyHash(existing);
        if (bodyHash === file.hash) {
          status = {
            kind: 'unchanged',
            existingPackId: header.packId,
            existingPackVersion: header.packVersion,
          };
        } else {
          status = {
            kind: 'update-managed',
            existingPackId: header.packId,
            existingPackVersion: header.packVersion,
          };
        }
      }
    }

    files.push({
      destination: file.destination,
      absolutePath,
      source: file.source,
      mergeStrategy: file.mergeStrategy,
      newContent: file.content,
      newHash: file.hash,
      status,
    });
  }

  return {
    packId: render.packId,
    packVersion: render.packVersion,
    repoDir,
    files,
  };
}

export function summarizeDiff(plan: DiffPlan): {
  create: number;
  update: number;
  unchanged: number;
  conflict: number;
} {
  let create = 0;
  let update = 0;
  let unchanged = 0;
  let conflict = 0;
  for (const f of plan.files) {
    switch (f.status.kind) {
      case 'create':
        create++;
        break;
      case 'update-managed':
        update++;
        break;
      case 'unchanged':
        unchanged++;
        break;
      case 'conflict-unmanaged':
      case 'conflict-other-pack':
        conflict++;
        break;
    }
  }
  return { create, update, unchanged, conflict };
}

export function hasConflicts(plan: DiffPlan): boolean {
  return plan.files.some(
    (f) => f.status.kind === 'conflict-unmanaged' || f.status.kind === 'conflict-other-pack',
  );
}

// ---------- Remote (GitHub PR) variant ----------

export interface RemotePlannedFileDiff {
  destination: string;
  source: string;
  mergeStrategy: PlannedFile['mergeStrategy'];
  newContent: string;
  newHash: string;
  /** SHA of the existing file on the base ref, if it exists. Needed for the
   *  GitHub Contents API PUT to update an existing file. */
  existingSha: string | null;
  status: DiffStatus;
}

export interface RemoteDiffPlan {
  packId: string;
  packVersion: string;
  owner: string;
  repo: string;
  baseRef: string;
  files: RemotePlannedFileDiff[];
}

export interface RemoteFileInfo {
  content: string;
  sha: string;
}

export interface PlanRemoteDiffOptions {
  owner: string;
  repo: string;
  baseRef: string;
  render: RenderResult;
  /**
   * Read a file from the target repo at the base ref. Return null when the
   * file does not exist. The diff classifier uses content + sha; sha is
   * required to update an existing file via the GitHub Contents API.
   */
  readExisting: (destinationPath: string) => Promise<RemoteFileInfo | null>;
}

export async function planRemoteDiff(options: PlanRemoteDiffOptions): Promise<RemoteDiffPlan> {
  const { owner, repo, baseRef, render } = options;
  const files: RemotePlannedFileDiff[] = [];

  for (const file of render.files) {
    assertSafeDestination(file.destination);
    const existing = await options.readExisting(file.destination);
    let status: DiffStatus;
    if (existing === null) {
      status = { kind: 'create' };
    } else {
      const header = parseManagedHeader(existing.content);
      if (!header) {
        status = { kind: 'conflict-unmanaged' };
      } else if (header.packId !== render.packId) {
        status = {
          kind: 'conflict-other-pack',
          existingPackId: header.packId,
          existingPackVersion: header.packVersion,
        };
      } else {
        const bodyHash = existingBodyHash(existing.content);
        if (bodyHash === file.hash) {
          status = {
            kind: 'unchanged',
            existingPackId: header.packId,
            existingPackVersion: header.packVersion,
          };
        } else {
          status = {
            kind: 'update-managed',
            existingPackId: header.packId,
            existingPackVersion: header.packVersion,
          };
        }
      }
    }

    files.push({
      destination: file.destination,
      source: file.source,
      mergeStrategy: file.mergeStrategy,
      newContent: file.content,
      newHash: file.hash,
      existingSha: existing?.sha ?? null,
      status,
    });
  }

  return { packId: render.packId, packVersion: render.packVersion, owner, repo, baseRef, files };
}

export function summarizeRemoteDiff(plan: RemoteDiffPlan): {
  create: number;
  update: number;
  unchanged: number;
  conflict: number;
} {
  let create = 0;
  let update = 0;
  let unchanged = 0;
  let conflict = 0;
  for (const f of plan.files) {
    switch (f.status.kind) {
      case 'create':
        create++;
        break;
      case 'update-managed':
        update++;
        break;
      case 'unchanged':
        unchanged++;
        break;
      case 'conflict-unmanaged':
      case 'conflict-other-pack':
        conflict++;
        break;
    }
  }
  return { create, update, unchanged, conflict };
}

export function hasRemoteConflicts(plan: RemoteDiffPlan): boolean {
  return plan.files.some(
    (f) => f.status.kind === 'conflict-unmanaged' || f.status.kind === 'conflict-other-pack',
  );
}
