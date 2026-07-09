import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DiffPlan, PlannedFileDiff } from '../diff/plan.js';

export type InstallAction =
  | 'created'
  | 'updated'
  | 'skipped-unchanged'
  | 'skipped-conflict'
  | 'overwritten';

export interface InstallFileResult {
  destination: string;
  absolutePath: string;
  action: InstallAction;
  reason?: string;
}

export interface InstallResult {
  packId: string;
  packVersion: string;
  repoDir: string;
  dryRun: boolean;
  files: InstallFileResult[];
}

export interface InstallOptions {
  /** If true, no files are written to disk. */
  dryRun?: boolean;
  /**
   * If true, conflicts (unmanaged or different-pack files) are overwritten.
   * Otherwise conflicts are skipped and reported.
   */
  force?: boolean;
}

function decideAction(file: PlannedFileDiff, force: boolean): { write: boolean; action: InstallAction; reason?: string } {
  switch (file.status.kind) {
    case 'create':
      return { write: true, action: 'created' };
    case 'update-managed':
      return { write: true, action: 'updated' };
    case 'unchanged':
      return { write: false, action: 'skipped-unchanged' };
    case 'conflict-unmanaged':
      return force
        ? { write: true, action: 'overwritten', reason: 'unmanaged file overwritten by --force' }
        : { write: false, action: 'skipped-conflict', reason: 'file exists without managed header; re-run with --force to overwrite' };
    case 'conflict-other-pack':
      return force
        ? { write: true, action: 'overwritten', reason: `managed by ${file.status.existingPackId}; overwritten by --force` }
        : { write: false, action: 'skipped-conflict', reason: `file managed by ${file.status.existingPackId}; re-run with --force to overwrite` };
  }
}

export async function installPlan(plan: DiffPlan, options: InstallOptions = {}): Promise<InstallResult> {
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? false;
  const results: InstallFileResult[] = [];

  for (const file of plan.files) {
    const decision = decideAction(file, force);
    const result: InstallFileResult = {
      destination: file.destination,
      absolutePath: file.absolutePath,
      action: decision.action,
    };
    if (decision.reason) result.reason = decision.reason;

    if (decision.write && !dryRun) {
      await mkdir(dirname(file.absolutePath), { recursive: true });
      await writeFile(file.absolutePath, file.newContent, 'utf8');
    }
    results.push(result);
  }

  return {
    packId: plan.packId,
    packVersion: plan.packVersion,
    repoDir: plan.repoDir,
    dryRun,
    files: results,
  };
}
