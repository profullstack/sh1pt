import type { Platform } from '../types.js';
import { MANAGED_PLATFORMS, tursoPlatform } from './managed.js';
import { railwayPlatform } from './railway.js';
import { sshPlatform } from './ssh.js';
import { supabasePlatform } from './supabase.js';

/**
 * Every platform this build can read from or write to.
 *
 * Direction is not encoded here. A platform declares whether it can be a
 * source, a target or both, and the planner pairs any two — so the number of
 * supported migrations is the number of pairs, not the number of entries.
 */
// biome-ignore lint/suspicious/noExplicitAny: the registry is heterogeneous by
// design — each platform has its own config type, and the CLI resolves the
// right one from a config file at runtime.
export const PLATFORMS: ReadonlyArray<Platform<any>> = [
  sshPlatform,
  railwayPlatform,
  supabasePlatform,
  tursoPlatform,
  ...MANAGED_PLATFORMS,
];

// biome-ignore lint/suspicious/noExplicitAny: see above.
export function platformById(id: string): Platform<any> | undefined {
  return PLATFORMS.find((p) => p.id === id);
}

/** Every platform that can be the left-hand side of a migration. */
export function sources(): ReadonlyArray<Platform<unknown>> {
  return PLATFORMS.filter((p) => p.role !== 'target');
}

/** Every platform that can be the right-hand side. */
export function targets(): ReadonlyArray<Platform<unknown>> {
  return PLATFORMS.filter((p) => p.role !== 'source');
}

/**
 * Whether a pair can move anything at all, and what.
 *
 * The intersection of what the source holds and what the target accepts. An
 * empty intersection is a migration that cannot happen, and saying so takes a
 * millisecond instead of a failed cutover.
 */
export function compatibleKinds(fromId: string, toId: string): string[] {
  const from = platformById(fromId);
  const to = platformById(toId);
  if (!from || !to) return [];
  const accepted = new Set(to.supports);
  return from.supports.filter((k) => accepted.has(k));
}

export { railwayPlatform, sshPlatform, supabasePlatform, tursoPlatform };
export * from './managed.js';
