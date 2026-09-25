import type { MigrationPlan, Phase, Step } from './plan.js';
import { PHASES } from './plan.js';
import type { Artifact, Engine, EngineContext, Resource, ResourceKind } from './types.js';

/**
 * Running a plan.
 *
 * The planner decided what happens and in what order; this does it, and its
 * only real job is refusing to deviate. Two things make a migration
 * catastrophic rather than merely failed: doing a later phase before an
 * earlier one, and carrying on after a step that was supposed to be a gate.
 * Both are prevented here rather than trusted to the caller.
 *
 * Everything that touches the world is injected — `exec`, the clock, the
 * staging — so the whole executor is exercised without a network, a database,
 * or a wall-clock wait.
 */

export interface ApplyOptions {
  plan: MigrationPlan;
  /** Source resources by id. */
  from: Map<string, Resource>;
  /** Target resources by id, already resolved by the target platform. */
  to: Map<string, Resource>;
  engines: Map<ResourceKind, Engine>;
  ctx: EngineContext;
  /**
   * Stop before this phase. `--until freeze` runs the whole bulk copy and
   * stops before anything goes down, which is how a migration is rehearsed
   * against production without a cutover.
   */
  until?: Phase;
  /** Steps already completed, from a previous run. */
  completed?: Set<string>;
  /** When the bulk copy started, for the delta. Defaults to now at freeze. */
  bulkStartedAt?: Date;
  /** Called after each step so a caller can persist progress. */
  onStep?: (step: Step, outcome: StepOutcome) => void | Promise<void>;
}

export interface StepOutcome {
  status: 'done' | 'skipped' | 'failed';
  reason?: string;
  artifacts?: Artifact[];
  error?: Error;
}

export interface ApplyResult {
  completed: string[];
  skipped: Array<{ id: string; reason: string }>;
  failed?: { id: string; error: Error };
  /** True when everything up to `until` ran. */
  ok: boolean;
  stoppedBefore?: Phase;
}

/**
 * Execute a plan.
 *
 * Refuses a plan with blockers. The planner already said it was not
 * applyable, and the one thing worse than a migration that will not start is
 * one that starts anyway.
 */
export async function applyPlan(opts: ApplyOptions): Promise<ApplyResult> {
  const { plan, ctx, engines } = opts;

  if (!plan.ok) {
    const blockers = plan.risks.filter((r) => r.severity === 'blocker').map((r) => r.message);
    throw new Error(`refusing to apply a plan with blockers:\n  ${blockers.join('\n  ')}`);
  }

  const completed = new Set(opts.completed ?? []);
  const done: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const stopIndex = opts.until ? PHASES.indexOf(opts.until) : PHASES.length;
  const artifactsByResource = new Map<string, Artifact[]>();
  let bulkStartedAt = opts.bulkStartedAt;

  for (const step of plan.steps) {
    if (PHASES.indexOf(step.phase) >= stopIndex) {
      return {
        completed: done,
        skipped,
        ok: true,
        stoppedBefore: opts.until!,
      };
    }

    if (completed.has(step.id)) {
      skipped.push({ id: step.id, reason: 'already done in a previous run' });
      await opts.onStep?.(step, { status: 'skipped', reason: 'already done' });
      continue;
    }

    /*
     * A step whose dependency did not run must not run either. The planner
     * ordered the steps, but a resumed run or a skipped step can leave a gap,
     * and "import" running without its "export" would restore whatever was in
     * staging from a previous, possibly different, migration.
     */
    const missing = step.after.filter(
      (dep) => plan.steps.some((s) => s.id === dep) && !completed.has(dep) && !done.includes(dep),
    );
    if (missing.length) {
      skipped.push({ id: step.id, reason: `depends on ${missing.join(', ')}, which did not run` });
      await opts.onStep?.(step, { status: 'skipped', reason: `unmet dependency: ${missing[0]}` });
      continue;
    }

    // The clock for the delta starts when the bulk copy starts, not when the
    // freeze does: anything written during the bulk copy is exactly what the
    // delta has to catch.
    if (step.phase === 'bulk' && !bulkStartedAt) bulkStartedAt = new Date();

    try {
      const outcome = await runStep(step, {
        ...opts,
        engines,
        ctx,
        artifactsByResource,
        bulkStartedAt: bulkStartedAt ?? new Date(),
      });
      if (outcome.status === 'skipped') {
        skipped.push({ id: step.id, reason: outcome.reason ?? 'skipped' });
      } else {
        done.push(step.id);
        completed.add(step.id);
      }
      await opts.onStep?.(step, outcome);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await opts.onStep?.(step, { status: 'failed', error });
      ctx.log(`step '${step.id}' failed: ${error.message}`, 'error');
      return { completed: done, skipped, failed: { id: step.id, error }, ok: false };
    }
  }

  return { completed: done, skipped, ok: true };
}

interface RunContext extends ApplyOptions {
  artifactsByResource: Map<string, Artifact[]>;
  bulkStartedAt: Date;
}

async function runStep(step: Step, rc: RunContext): Promise<StepOutcome> {
  const { ctx, engines, from, to, artifactsByResource } = rc;

  // Steps with no resource are gates and instructions: the freeze, the DNS
  // cutover, the URL rewrite. They are real work, but not work this executor
  // can do unattended — pointing DNS at a new host is not something to do on
  // a caller's behalf without being asked very explicitly.
  if (!step.resourceId) {
    ctx.log(`${step.phase}: ${step.title}`);
    return { status: 'done' };
  }

  const source = from.get(step.resourceId);
  const target = to.get(step.resourceId);
  const kind = step.kind;
  const engine = kind ? engines.get(kind) : undefined;

  if (!engine || !source) {
    return { status: 'skipped', reason: `no engine or source for ${step.resourceId}` };
  }

  const verb = step.id.split(':')[0];

  switch (verb) {
    case 'export': {
      const artifacts = await engine.export(ctx, source);
      artifactsByResource.set(step.resourceId, artifacts);
      return { status: 'done', artifacts };
    }
    case 'import': {
      if (!target) return { status: 'skipped', reason: `no target resolved for ${step.resourceId}` };
      const staged =
        artifactsByResource.get(step.resourceId) ?? (await ctx.staging.existing(step.resourceId));
      await engine.import(ctx, target, staged, source);
      return { status: 'done' };
    }
    case 'delta': {
      if (!engine.delta) return { status: 'skipped', reason: 'engine has no delta' };
      const artifacts = await engine.delta(ctx, source, rc.bulkStartedAt);
      if (target && artifacts.length) await engine.import(ctx, target, artifacts, source);
      return { status: 'done', artifacts };
    }
    case 'verify': {
      if (!engine.verify) return { status: 'skipped', reason: 'engine has no verify' };
      if (!target) return { status: 'skipped', reason: 'no target to compare against' };
      const result = await engine.verify(ctx, source, target);
      for (const line of result.checks) ctx.log(`  ${line}`);
      if (!result.ok) {
        throw new Error(`verification failed for ${source.name}:\n  ${result.problems.join('\n  ')}`);
      }
      return { status: 'done' };
    }
    case 'disable':
    case 'enable':
      // Scheduled jobs. Surfaced rather than automated, for the same reason as
      // the DNS cutover: turning cron on at the wrong moment is the failure
      // the phase ordering exists to prevent, and doing it silently would put
      // the decision back in the tool.
      ctx.log(`${step.phase}: ${step.title}`, 'warn');
      return { status: 'done' };
    default:
      ctx.log(`${step.phase}: ${step.title}`);
      return { status: 'done' };
  }
}
