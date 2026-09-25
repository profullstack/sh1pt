import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Artifact, Staging } from './types.js';

/**
 * Where a migration keeps what it has already done.
 *
 * A migration is long and interrupted runs are normal — a laptop sleeps, a
 * token expires, someone hits ctrl-C during the bulk copy because they
 * realised they picked the wrong project. The staging directory is what makes
 * the next run cheap instead of a restart: a ledger of finished artifacts, on
 * disk, next to the bytes they describe.
 *
 * The ledger is append-only JSON lines rather than one rewritten JSON file.
 * A process killed mid-write corrupts the file it was rewriting; it can only
 * ever truncate the last line of an append-only one, and a half-written line
 * fails to parse and is skipped. That is the difference between resuming and
 * starting over.
 */

const LEDGER = 'artifacts.jsonl';

export interface StagingOptions {
  /** Root directory. Created if absent. */
  dir: string;
}

export async function openStaging(opts: StagingOptions): Promise<Staging> {
  const dir = resolve(opts.dir);
  await mkdir(dir, { recursive: true });
  const ledgerPath = join(dir, LEDGER);

  return {
    dir,

    async record(artifact: Artifact): Promise<void> {
      await mkdir(dirname(join(dir, artifact.path)), { recursive: true });
      await writeFile(ledgerPath, `${JSON.stringify(artifact)}\n`, { flag: 'a' });
    },

    async existing(resourceId: string): Promise<Artifact[]> {
      let text: string;
      try {
        text = await readFile(ledgerPath, 'utf8');
      } catch {
        return [];
      }
      return parseLedger(text).filter((a) => a.resourceId === resourceId);
    },
  };
}

/**
 * Read the ledger, skipping anything unparseable.
 *
 * A truncated final line is the expected shape of an interrupted run, not an
 * error: the process died mid-write. Throwing here would turn a resumable
 * migration into a manual cleanup, so a bad line is dropped and the rest is
 * used.
 */
export function parseLedger(text: string): Artifact[] {
  const out: Artifact[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Artifact;
      if (parsed && typeof parsed.path === 'string' && typeof parsed.resourceId === 'string') {
        out.push(parsed);
      }
    } catch {
      // A partial line from an interrupted write. Skip it.
    }
  }
  return out;
}

/** Checksum a staged file, so a resumed run can tell complete from truncated. */
export function sha256File(path: string): Promise<string> {
  return new Promise((res, rej) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('error', rej);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => res(hash.digest('hex')));
  });
}

/**
 * An in-memory staging, for tests and for `--dry-run`.
 *
 * A dry run must not create directories on someone's disk as a side effect of
 * being asked what it would do.
 */
export function memoryStaging(dir = '/staging'): Staging & { artifacts: Artifact[] } {
  const artifacts: Artifact[] = [];
  return {
    dir,
    artifacts,
    async record(a) {
      artifacts.push(a);
    },
    async existing(resourceId) {
      return artifacts.filter((a) => a.resourceId === resourceId);
    },
  };
}
