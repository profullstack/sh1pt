import type { Engine, Inventory, Platform, Resource, ResourceKind } from './types.js';

/**
 * Turning an inventory into an ordered, reviewable plan.
 *
 * The plan is the product. A migration that goes wrong usually went wrong
 * before anything ran — a resource nobody knew was there, a cutover step in
 * the wrong order, an assumption that the destination supported something it
 * did not. All of that is knowable up front, from a read-only inventory, and
 * this module is where it is worked out so a person can read it and disagree
 * before any bytes move.
 *
 * Nothing here touches the network or mutates anything. Given the same
 * inventory it produces the same plan, which is what makes it testable.
 */

/** A single unit of work in the plan. */
export interface Step {
  id: string;
  phase: Phase;
  /** One line, imperative: "dump postgres 'app' (4.7 GB)". */
  title: string;
  resourceId?: string;
  kind?: ResourceKind;
  /** Steps that must complete before this one. */
  after: string[];
  /** True when this step changes the SOURCE, which is what makes it scary. */
  touchesSource?: boolean;
  /** Set when the step cannot be undone by re-running the migration. */
  irreversible?: boolean;
  estimateBytes?: number;
}

/**
 * The phases, in the only order that is safe.
 *
 * The ordering is the part people get wrong, and it is not arbitrary:
 *
 *  - `check` first so a missing credential costs a second, not three hours.
 *  - `bulk` runs while the source is still live and serving. It is the long
 *    part and it is safe to repeat.
 *  - `freeze` is the start of downtime: stop the things that write. Scheduled
 *    jobs especially — a cron firing on both sides is how a migration sends
 *    every customer a duplicate email.
 *  - `delta` copies only what changed during `bulk`. Short, because `bulk`
 *    already moved the bulk.
 *  - `cutover` points the world at the new place.
 *  - `enable` starts the writers again, on the target only, and never before
 *    `freeze` has stopped them on the source.
 *  - `verify` proves it worked while the old system still exists.
 *
 * Deleting the source is not a phase. It is a separate decision a person makes
 * days later, and this tool does not offer it.
 */
export type Phase = 'check' | 'bulk' | 'freeze' | 'delta' | 'cutover' | 'enable' | 'verify';

export const PHASES: readonly Phase[] = [
  'check',
  'bulk',
  'freeze',
  'delta',
  'cutover',
  'enable',
  'verify',
] as const;

export interface Risk {
  severity: 'blocker' | 'warning' | 'note';
  /** What is wrong, in a sentence a person can act on. */
  message: string;
  resourceId?: string;
}

export interface MigrationPlan {
  source: string;
  target: string;
  scope: string;
  steps: Step[];
  risks: Risk[];
  /** Resources that will move, paired source → target kind. */
  moving: Resource[];
  /** Resources that will NOT move, and why. */
  skipped: Array<{ resource: Resource; reason: string }>;
  estimateBytes: number;
  /** False when any risk is a blocker. `apply` refuses a plan that is not ok. */
  ok: boolean;
}

export interface PlanOptions {
  /** Only migrate these kinds. Empty means everything the target supports. */
  only?: ResourceKind[];
  /** Never migrate these kinds. */
  exclude?: ResourceKind[];
  /**
   * Hosts whose absolute URLs are expected to appear in the data and must be
   * rewritten, e.g. `ywcizjsgrcmhgyplldac.supabase.co`. See `transforms.ts`.
   */
  rewriteHosts?: string[];
  /** Engines available in this build, by kind. */
  engines: Map<ResourceKind, Engine>;
  /** Binaries present on this machine, for the `requires` check. */
  availableBinaries?: Set<string>;
}

/** Kinds whose contents are routinely referenced by absolute URL from a database. */
const URL_BEARING: ReadonlySet<ResourceKind> = new Set<ResourceKind>(['object-storage']);

/**
 * Kinds that write on a schedule and so must be stopped before the delta, or
 * they run in two places at once.
 */
const SCHEDULED: ReadonlySet<ResourceKind> = new Set<ResourceKind>(['cron']);

function stepId(prefix: string, resourceId: string): string {
  return `${prefix}:${resourceId}`;
}

/**
 * Work out what would happen, without doing any of it.
 *
 * Read-only in the strongest sense: it takes an inventory that has already
 * been gathered and a description of the target, and returns a plan. It does
 * not call the network, so it is fully testable and so `migrate plan` can be
 * run against production with no anxiety.
 */
export function planMigration(
  source: Inventory,
  target: Platform,
  opts: PlanOptions,
): MigrationPlan {
  const risks: Risk[] = [];
  const steps: Step[] = [];
  const moving: Resource[] = [];
  const skipped: Array<{ resource: Resource; reason: string }> = [];

  const only = new Set(opts.only ?? []);
  const exclude = new Set(opts.exclude ?? []);
  const targetKinds = new Set(target.supports);

  if (target.role === 'source') {
    risks.push({
      severity: 'blocker',
      message: `${target.label} cannot be a migration target: it offers no import path.`,
    });
  }

  for (const resource of source.resources) {
    if (only.size && !only.has(resource.kind)) {
      skipped.push({ resource, reason: `not in --only` });
      continue;
    }
    if (exclude.has(resource.kind)) {
      skipped.push({ resource, reason: `excluded by --exclude` });
      continue;
    }
    if (!targetKinds.has(resource.kind)) {
      skipped.push({
        resource,
        reason: `${target.label} does not support ${resource.kind}`,
      });
      risks.push({
        severity: 'blocker',
        resourceId: resource.id,
        message: `${resource.name} is ${resource.kind}, which ${target.label} cannot hold. Exclude it with --exclude ${resource.kind}, or pick a different target.`,
      });
      continue;
    }

    const engine = opts.engines.get(resource.kind);
    if (!engine) {
      skipped.push({ resource, reason: `no engine for ${resource.kind}` });
      risks.push({
        severity: 'blocker',
        resourceId: resource.id,
        message: `Nothing in this build can move a ${resource.kind}.`,
      });
      continue;
    }

    // A missing pg_dump is a blocker, and finding out now beats finding out
    // after the freeze has started.
    if (opts.availableBinaries) {
      const missing = engine.requires.filter((b) => !opts.availableBinaries!.has(b));
      if (missing.length) {
        risks.push({
          severity: 'blocker',
          resourceId: resource.id,
          message: `${resource.kind} needs ${missing.join(', ')} on this machine and ${missing.length > 1 ? 'they are' : 'it is'} not installed.`,
        });
      }
    }

    moving.push(resource);

    steps.push({
      id: stepId('export', resource.id),
      phase: 'bulk',
      title: `export ${resource.kind} ${resource.name}${sizeSuffix(resource)}`,
      resourceId: resource.id,
      kind: resource.kind,
      after: ['check:all'],
      estimateBytes: resource.sizeBytes,
    });

    steps.push({
      id: stepId('import', resource.id),
      phase: 'bulk',
      title: `import ${resource.kind} ${resource.name} into ${target.label}`,
      resourceId: resource.id,
      kind: resource.kind,
      after: [stepId('export', resource.id)],
      estimateBytes: resource.sizeBytes,
    });

    if (engine.delta) {
      steps.push({
        id: stepId('delta', resource.id),
        phase: 'delta',
        title: `sync ${resource.name} changes made during the bulk copy`,
        resourceId: resource.id,
        kind: resource.kind,
        after: ['freeze:all', stepId('import', resource.id)],
      });
    } else {
      risks.push({
        severity: 'warning',
        resourceId: resource.id,
        message: `${resource.name} (${resource.kind}) has no delta sync, so anything written to it during the bulk copy is lost. Stop writes before the copy, or accept the gap.`,
      });
    }

    if (engine.verify) {
      steps.push({
        id: stepId('verify', resource.id),
        phase: 'verify',
        title: `verify ${resource.name} matches the source`,
        resourceId: resource.id,
        kind: resource.kind,
        after: ['cutover:dns'],
      });
    }

    for (const quirk of resource.quirks ?? []) {
      risks.push({
        severity: 'warning',
        resourceId: resource.id,
        message: `${resource.name}: ${quirk}`,
      });
    }

    if (SCHEDULED.has(resource.kind)) {
      steps.push({
        id: stepId('disable', resource.id),
        phase: 'freeze',
        title: `disable scheduled jobs on the SOURCE (${resource.name})`,
        resourceId: resource.id,
        kind: resource.kind,
        after: [],
        touchesSource: true,
      });
      steps.push({
        id: stepId('enable', resource.id),
        phase: 'enable',
        title: `enable scheduled jobs on the TARGET (${resource.name})`,
        resourceId: resource.id,
        kind: resource.kind,
        // Never before the source's are off. Two schedulers on one dataset is
        // duplicate outbound email and duplicate published posts.
        after: [stepId('disable', resource.id), 'cutover:dns'],
      });
    }
  }

  // The absolute-URL trap. Object storage moves to a new host, but rows that
  // stored `https://<old-host>/...` keep working until the old account is
  // closed and then 404 forever. It is invisible at cutover, which is what
  // makes it dangerous.
  const storage = moving.filter((r) => URL_BEARING.has(r.kind));
  const databases = moving.filter((r) => r.kind === 'postgres' || r.kind === 'mysql');
  if (storage.length && databases.length) {
    const hosts = opts.rewriteHosts ?? [];
    steps.push({
      id: 'rewrite:urls',
      phase: 'delta',
      title: hosts.length
        ? `rewrite absolute URLs (${hosts.join(', ')}) to the new host`
        : `scan for absolute URLs pointing at the old storage host`,
      after: databases.map((d) => stepId('import', d.id)),
      irreversible: false,
    });
    if (!hosts.length) {
      risks.push({
        severity: 'warning',
        message:
          'Storage and a database are both moving but no --rewrite-host was given. Rows holding absolute URLs to the old storage host keep working until that account is closed, then 404 permanently. The scan step will report what it finds; pass --rewrite-host to fix them.',
      });
    }
  }

  steps.push({
    id: 'check:all',
    phase: 'check',
    title: `check credentials and connectivity for ${source.platform} and ${target.label}`,
    after: [],
  });

  if (moving.length) {
    steps.push({
      id: 'freeze:all',
      phase: 'freeze',
      title: 'stop writes on the source (downtime starts here)',
      after: moving.map((r) => stepId('import', r.id)),
      touchesSource: true,
    });
    steps.push({
      id: 'cutover:dns',
      phase: 'cutover',
      title: 'point DNS at the target',
      after: ['freeze:all', ...moving.filter(hasDelta(opts)).map((r) => stepId('delta', r.id))],
      irreversible: false,
    });
  }

  for (const note of source.notes ?? []) {
    risks.push({ severity: 'note', message: note });
  }

  if (!moving.length) {
    risks.push({
      severity: 'blocker',
      message: 'Nothing to migrate: every resource was skipped or unsupported.',
    });
  }

  const ordered = orderSteps(steps);
  const estimateBytes = moving.reduce((sum, r) => sum + (r.sizeBytes ?? 0), 0);

  return {
    source: source.platform,
    target: target.id,
    scope: source.scope,
    steps: ordered,
    risks,
    moving,
    skipped,
    estimateBytes,
    ok: !risks.some((r) => r.severity === 'blocker'),
  };
}

function hasDelta(opts: PlanOptions) {
  return (r: Resource) => Boolean(opts.engines.get(r.kind)?.delta);
}

function sizeSuffix(r: Resource): string {
  if (r.sizeBytes) return ` (${humanBytes(r.sizeBytes)})`;
  if (r.itemCount) return ` (${r.itemCount.toLocaleString()} items)`;
  return '';
}

export function humanBytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/**
 * Sort steps by phase, then by dependency within the phase.
 *
 * Phase order is absolute and comes first: a `delta` step never runs before a
 * `freeze` step even if nothing declares the dependency, because the phase
 * ordering *is* the safety property. Within a phase, a stable topological sort
 * respects `after`, and a cycle throws rather than quietly picking an order —
 * a cyclic plan is a bug in the planner and running it would be worse than
 * failing.
 */
export function orderSteps(steps: Step[]): Step[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const out: Step[] = [];
  const done = new Set<string>();

  for (const phase of PHASES) {
    const inPhase = steps.filter((s) => s.phase === phase);
    const pending = new Map(inPhase.map((s) => [s.id, s]));

    while (pending.size) {
      let progressed = false;
      for (const [id, step] of [...pending]) {
        // Only dependencies inside this phase can block; an earlier phase has
        // already run by construction, and a dependency on a later phase would
        // be a planner bug, caught below.
        const blocking = step.after.filter(
          (dep) => pending.has(dep) && dep !== id && byId.get(dep)?.phase === phase,
        );
        if (blocking.length === 0) {
          out.push(step);
          done.add(id);
          pending.delete(id);
          progressed = true;
        }
      }
      if (!progressed) {
        throw new Error(
          `migration plan has a dependency cycle in phase '${phase}' among: ${[...pending.keys()].join(', ')}`,
        );
      }
    }
  }

  // A dependency naming a step in a LATER phase inverts the safety ordering.
  for (const step of out) {
    for (const dep of step.after) {
      const target = byId.get(dep);
      if (!target) continue;
      if (PHASES.indexOf(target.phase) > PHASES.indexOf(step.phase)) {
        throw new Error(
          `step '${step.id}' (${step.phase}) depends on '${dep}' (${target.phase}), which runs later`,
        );
      }
    }
  }

  return out;
}

/** Render a plan the way `sh1pt migrate plan` prints it. */
export function renderPlan(plan: MigrationPlan): string {
  const lines: string[] = [];
  lines.push(`${plan.source} → ${plan.target}   (${plan.scope})`);
  lines.push('');

  if (plan.moving.length) {
    lines.push(`Moving ${plan.moving.length} resource(s), ${humanBytes(plan.estimateBytes)}:`);
    for (const r of plan.moving) lines.push(`  ${r.kind.padEnd(15)} ${r.name}${sizeSuffix(r)}`);
    lines.push('');
  }

  if (plan.skipped.length) {
    lines.push('Not moving:');
    for (const s of plan.skipped) lines.push(`  ${s.resource.name} — ${s.reason}`);
    lines.push('');
  }

  let phase: Phase | null = null;
  for (const step of plan.steps) {
    if (step.phase !== phase) {
      phase = step.phase;
      lines.push(`${phase}:`);
    }
    const marks = [
      step.touchesSource ? 'SOURCE' : null,
      step.irreversible ? 'IRREVERSIBLE' : null,
    ].filter(Boolean);
    lines.push(`  ${step.title}${marks.length ? `   [${marks.join(' ')}]` : ''}`);
  }

  if (plan.risks.length) {
    lines.push('');
    for (const sev of ['blocker', 'warning', 'note'] as const) {
      for (const r of plan.risks.filter((x) => x.severity === sev)) {
        lines.push(`${sev.toUpperCase()}: ${r.message}`);
      }
    }
  }

  lines.push('');
  lines.push(plan.ok ? 'Plan is applyable.' : 'Plan has blockers and cannot be applied.');
  return lines.join('\n');
}
