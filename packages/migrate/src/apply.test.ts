import { describe, expect, it, vi } from 'vitest';
import { applyPlan } from './apply.js';
import { planMigration } from './plan.js';
import { memoryStaging, parseLedger } from './staging.js';
import type { Engine, EngineContext, Inventory, Platform, Resource, ResourceKind } from './types.js';
import { secret } from './types.js';

function engineCtx(over: Partial<EngineContext> = {}): EngineContext {
  return {
    dryRun: false,
    log: () => {},
    staging: memoryStaging(),
    exec: async () => ({ code: 0, stdout: '', stderr: '' }),
    ...over,
  };
}

/** An engine that records what it was asked to do. */
function spyEngine(kind: ResourceKind, over: Partial<Engine> = {}) {
  const calls: string[] = [];
  const engine: Engine = {
    kind,
    requires: [],
    export: async (_c, r) => {
      calls.push(`export:${r.id}`);
      return [{ resourceId: r.id, kind, path: `${r.id}/dump` }];
    },
    import: async (_c, r) => {
      calls.push(`import:${r.id}`);
    },
    delta: async (_c, r) => {
      calls.push(`delta:${r.id}`);
      return [{ resourceId: r.id, kind, path: `${r.id}/delta` }];
    },
    verify: async (_c, r) => {
      calls.push(`verify:${r.id}`);
      return { ok: true, checks: [], problems: [] };
    },
    ...over,
  };
  return { engine, calls };
}

const resource = (id: string, kind: ResourceKind = 'postgres'): Resource => ({
  kind,
  id,
  name: id,
  connection: { url: secret('postgres://u:p@h/d') },
});

const target = (supports: ResourceKind[] = ['postgres', 'object-storage', 'cron']): Platform => ({
  id: 'ssh',
  label: 'box',
  role: 'both',
  supports,
  inventory: async () => ({ platform: 'ssh', scope: 'box', resources: [] }),
});

function setup(resources: Resource[], engineOver: Partial<Engine> = {}) {
  const { engine, calls } = spyEngine('postgres', engineOver);
  const engines = new Map<ResourceKind, Engine>([['postgres', engine]]);
  const inventory: Inventory = { platform: 'supabase', scope: 'proj', resources };
  const plan = planMigration(inventory, target(), { engines });
  const from = new Map(resources.map((r) => [r.id, r]));
  const to = new Map(resources.map((r) => [r.id, { ...r, id: r.id }]));
  return { plan, engines, from, to, calls };
}

describe('applyPlan', () => {
  it('runs export before import for each resource', async () => {
    const { plan, engines, from, to, calls } = setup([resource('db')]);
    const res = await applyPlan({ plan, engines, from, to, ctx: engineCtx() });

    expect(res.ok).toBe(true);
    expect(calls.indexOf('export:db')).toBeLessThan(calls.indexOf('import:db'));
  });

  it('refuses a plan the planner already marked unapplyable', async () => {
    const { engine } = spyEngine('postgres');
    const engines = new Map<ResourceKind, Engine>([['postgres', engine]]);
    const plan = planMigration(
      { platform: 'x', scope: 's', resources: [resource('db')] },
      target(['files']),
      { engines },
    );
    expect(plan.ok).toBe(false);

    await expect(
      applyPlan({ plan, engines, from: new Map(), to: new Map(), ctx: engineCtx() }),
    ).rejects.toThrow(/refusing to apply a plan with blockers/);
  });

  it('stops before the phase named by --until, which is how a rehearsal works', async () => {
    const { plan, engines, from, to, calls } = setup([resource('db')]);
    const res = await applyPlan({ plan, engines, from, to, ctx: engineCtx(), until: 'freeze' });

    expect(res.stoppedBefore).toBe('freeze');
    expect(calls).toContain('export:db');
    expect(calls).toContain('import:db');
    // Nothing that causes downtime ran.
    expect(calls).not.toContain('delta:db');
  });

  it('skips steps already completed in a previous run', async () => {
    const { plan, engines, from, to, calls } = setup([resource('db')]);
    const res = await applyPlan({
      plan,
      engines,
      from,
      to,
      ctx: engineCtx(),
      completed: new Set(['export:db']),
    });

    expect(calls).not.toContain('export:db');
    expect(res.skipped.some((s) => s.id === 'export:db')).toBe(true);
  });

  it('refuses to run a step whose dependency did not run', async () => {
    // An import with no export would restore whatever happens to be in
    // staging, possibly from a different migration entirely.
    const { plan, engines, from, to, calls } = setup([resource('db')], {
      export: async () => {
        throw new Error('nope');
      },
    });
    const res = await applyPlan({ plan, engines, from, to, ctx: engineCtx() });
    expect(res.ok).toBe(false);
    expect(calls).not.toContain('import:db');
  });

  it('stops at the first failure and reports which step', async () => {
    const { plan, engines, from, to } = setup([resource('db')], {
      import: async () => {
        throw new Error('restore blew up');
      },
    });
    const res = await applyPlan({ plan, engines, from, to, ctx: engineCtx() });

    expect(res.ok).toBe(false);
    expect(res.failed?.id).toBe('import:db');
    expect(res.failed?.error.message).toContain('restore blew up');
  });

  it('fails the migration when verification does not pass', async () => {
    const { plan, engines, from, to } = setup([resource('db')], {
      verify: async () => ({ ok: false, checks: [], problems: ['public.users: 113 → 9'] }),
    });
    const res = await applyPlan({ plan, engines, from, to, ctx: engineCtx() });

    expect(res.ok).toBe(false);
    expect(res.failed?.error.message).toContain('113 → 9');
  });

  it('reports every step to the callback so progress can be persisted', async () => {
    const { plan, engines, from, to } = setup([resource('db')]);
    const onStep = vi.fn();
    await applyPlan({ plan, engines, from, to, ctx: engineCtx(), onStep });
    expect(onStep).toHaveBeenCalled();
  });

  it('runs the delta against the time the bulk copy started, not the freeze', async () => {
    const seen: Date[] = [];
    const { plan, engines, from, to } = setup([resource('db')], {
      delta: async (_c, _r, since) => {
        seen.push(since);
        return [];
      },
    });
    const bulkStartedAt = new Date('2026-09-24T20:00:00Z');
    await applyPlan({ plan, engines, from, to, ctx: engineCtx(), bulkStartedAt });
    expect(seen[0]?.toISOString()).toBe('2026-09-24T20:00:00.000Z');
  });

  it('never runs a later phase before an earlier one', async () => {
    const order: string[] = [];
    const { plan, engines, from, to } = setup([resource('db')]);
    await applyPlan({
      plan,
      engines,
      from,
      to,
      ctx: engineCtx(),
      onStep: (step) => {
        order.push(step.phase);
      },
    });
    const idx = order.map((p) => ['check', 'bulk', 'freeze', 'delta', 'cutover', 'enable', 'verify'].indexOf(p));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });
});

describe('the staging ledger', () => {
  it('reads back what was written', () => {
    const text = '{"resourceId":"db","kind":"postgres","path":"db/dump.pgc"}\n';
    expect(parseLedger(text)).toHaveLength(1);
  });

  it('skips a truncated final line, which is what an interrupted run leaves', () => {
    const text =
      '{"resourceId":"db","kind":"postgres","path":"a"}\n{"resourceId":"db","kind":"post';
    const out = parseLedger(text);
    expect(out).toHaveLength(1);
    expect(out[0]?.path).toBe('a');
  });

  it('ignores blank lines', () => {
    expect(parseLedger('\n\n')).toEqual([]);
  });

  it('drops an entry missing the fields that identify it', () => {
    expect(parseLedger('{"nope":true}\n')).toEqual([]);
  });

  it('keeps artifacts per resource', async () => {
    const s = memoryStaging();
    await s.record({ resourceId: 'a', kind: 'postgres', path: 'a/1' });
    await s.record({ resourceId: 'b', kind: 'postgres', path: 'b/1' });
    expect(await s.existing('a')).toHaveLength(1);
  });
});
