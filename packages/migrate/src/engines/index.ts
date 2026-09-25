import type { Engine, ResourceKind } from '../types.js';
import { filesEngine } from './files.js';
import { objectStorageEngine } from './object-storage.js';
import { postgresEngine } from './postgres.js';
import { redisEngine } from './redis.js';
import { sqliteEngine } from './sqlite.js';

/**
 * Every engine this build can run, keyed by what it moves.
 *
 * The planner takes this map and refuses, up front, to plan a migration for a
 * kind that is not in it — which is the difference between "we do not support
 * that" printed before anything happens and a crash after the freeze.
 */
export const ENGINES: ReadonlyMap<ResourceKind, Engine> = new Map<ResourceKind, Engine>([
  ['postgres', postgresEngine],
  ['sqlite', sqliteEngine],
  ['redis', redisEngine],
  ['object-storage', objectStorageEngine],
  ['files', filesEngine],
]);

export function engineFor(kind: ResourceKind): Engine | undefined {
  return ENGINES.get(kind);
}

/** Every binary any engine needs, for a one-shot preflight check. */
export function requiredBinaries(kinds: ResourceKind[]): string[] {
  const out = new Set<string>();
  for (const kind of kinds) {
    for (const bin of ENGINES.get(kind)?.requires ?? []) out.add(bin);
  }
  return [...out].sort();
}

export { filesEngine, objectStorageEngine, postgresEngine, redisEngine, sqliteEngine };
