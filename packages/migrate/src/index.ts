/**
 * @profullstack/sh1pt-migrate — move an application and its data between
 * platforms, in either direction.
 *
 * `packages/cloud/*` provisions machines. This moves what lives on them.
 *
 * The design in one paragraph: PLATFORMS (Railway, Supabase, Turso, Neon, a
 * box over ssh) resolve credentials and enumerate what they hold, and never
 * move a byte. ENGINES (postgres, sqlite, redis, object-storage, files) move
 * bytes and do not know which vendor is on either end. A migration is possible
 * when the target accepts a kind the source holds, which `compatibleKinds`
 * answers instantly. Direction is not a property of the system — it is which
 * platform you named first.
 *
 * Typical use:
 *
 *   const inventory = await supabasePlatform.inventory(ctx, { projectRef, dbPassword });
 *   const plan = planMigration(inventory, sshPlatform, { engines: ENGINES });
 *   console.log(renderPlan(plan));          // safe against production
 *   if (plan.ok) await applyPlan({ plan, ... });
 */

export * from './types.js';
export * from './plan.js';
export * from './apply.js';
export * from './staging.js';
export * from './transforms.js';
export * from './exec.js';
export { ENGINES, engineFor, requiredBinaries } from './engines/index.js';
export {
  filesEngine,
  mysqlEngine,
  objectStorageEngine,
  postgresEngine,
  redisEngine,
  sqliteEngine,
} from './engines/index.js';
export {
  PLATFORMS,
  compatibleKinds,
  platformById,
  railwayPlatform,
  sources,
  sshPlatform,
  supabasePlatform,
  targets,
  tursoPlatform,
} from './platforms/index.js';
export type { SshConfig } from './platforms/ssh.js';
export type { RailwayConfig } from './platforms/railway.js';
export type { SupabaseConfig } from './platforms/supabase.js';
export type { DsnConfig, TursoConfig } from './platforms/managed.js';
