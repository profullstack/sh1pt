import { describe, expect, it } from 'vitest';
import { PHASES, type Phase, type Step, humanBytes, orderSteps, planMigration, renderPlan } from './plan.js';
import { type Engine, type Inventory, type Platform, type Resource, plain, secret } from './types.js';

const engine = (kind: Engine['kind'], over: Partial<Engine> = {}): Engine => ({
  kind,
  requires: [],
  export: async () => [],
  import: async () => {},
  ...over,
});

/** A full engine set: everything can move, delta and verify included. */
function engines(over: Partial<Record<Resource['kind'], Engine>> = {}): Map<Resource['kind'], Engine> {
  const base: Array<[Resource['kind'], Engine]> = [
    ['postgres', engine('postgres', { requires: ['pg_dump'], delta: async () => [], verify: async () => ({ ok: true, checks: [], problems: [] }) })],
    ['object-storage', engine('object-storage', { delta: async () => [] })],
    ['redis', engine('redis')],
    ['cron', engine('cron')],
  ];
  const m = new Map(base);
  for (const [k, v] of Object.entries(over)) m.set(k as Resource['kind'], v as Engine);
  return m;
}

const resource = (over: Partial<Resource> & Pick<Resource, 'kind' | 'id' | 'name'>): Resource => ({
  connection: { url: secret('postgres://u:p@h/db') },
  ...over,
});

const inventory = (resources: Resource[], over: Partial<Inventory> = {}): Inventory => ({
  platform: 'supabase',
  scope: 'project abc123',
  resources,
  ...over,
});

const target = (over: Partial<Platform> = {}): Platform => ({
  id: 'ssh',
  label: 'dedicated box',
  role: 'both',
  supports: ['postgres', 'object-storage', 'redis', 'files', 'cron'],
  inventory: async () => inventory([]),
  ...over,
});

describe('planMigration', () => {
  it('pairs every supported resource and estimates the total', () => {
    const plan = planMigration(
      inventory([
        resource({ kind: 'postgres', id: 'db', name: 'app', sizeBytes: 4_700_000_000 }),
        resource({ kind: 'object-storage', id: 'b1', name: 'public', itemCount: 8410 }),
      ]),
      target(),
      { engines: engines() },
    );

    expect(plan.ok).toBe(true);
    expect(plan.moving.map((r) => r.id)).toEqual(['db', 'b1']);
    expect(plan.estimateBytes).toBe(4_700_000_000);
  });

  it('blocks when the target cannot hold a resource kind', () => {
    const plan = planMigration(
      inventory([resource({ kind: 'postgres', id: 'db', name: 'app' })]),
      target({ supports: ['files'] }),
      { engines: engines() },
    );

    expect(plan.ok).toBe(false);
    expect(plan.skipped[0]?.reason).toContain('does not support postgres');
    expect(plan.risks.some((r) => r.severity === 'blocker')).toBe(true);
  });

  it('refuses a target that cannot be written to at all', () => {
    const plan = planMigration(
      inventory([resource({ kind: 'postgres', id: 'db', name: 'app' })]),
      target({ role: 'source' }),
      { engines: engines() },
    );
    expect(plan.ok).toBe(false);
    expect(plan.risks.some((r) => /offers no import path/.test(r.message))).toBe(true);
  });

  it('blocks when a required binary is missing, before anything runs', () => {
    const plan = planMigration(
      inventory([resource({ kind: 'postgres', id: 'db', name: 'app' })]),
      target(),
      { engines: engines(), availableBinaries: new Set<string>() },
    );
    expect(plan.ok).toBe(false);
    expect(plan.risks.some((r) => r.message.includes('pg_dump'))).toBe(true);
  });

  it('accepts the plan when the binary is present', () => {
    const plan = planMigration(
      inventory([resource({ kind: 'postgres', id: 'db', name: 'app' })]),
      target(),
      { engines: engines(), availableBinaries: new Set(['pg_dump']) },
    );
    expect(plan.ok).toBe(true);
  });

  it('warns when a resource has no delta sync, because writes during the copy are lost', () => {
    const plan = planMigration(
      inventory([resource({ kind: 'redis', id: 'r', name: 'cache' })]),
      target(),
      { engines: engines() },
    );
    expect(plan.risks.some((r) => /no delta sync/.test(r.message))).toBe(true);
  });

  it('surfaces a resource quirk as a warning rather than discovering it mid-restore', () => {
    const plan = planMigration(
      inventory([
        resource({
          kind: 'postgres',
          id: 'db',
          name: 'app',
          quirks: ['uses the pg_cron extension, which the target must also have'],
        }),
      ]),
      target(),
      { engines: engines() },
    );
    expect(plan.risks.some((r) => /pg_cron/.test(r.message))).toBe(true);
  });

  it('honours --only and --exclude', () => {
    const rs = [
      resource({ kind: 'postgres', id: 'db', name: 'app' }),
      resource({ kind: 'redis', id: 'r', name: 'cache' }),
    ];
    const onlyDb = planMigration(inventory(rs), target(), { engines: engines(), only: ['postgres'] });
    expect(onlyDb.moving.map((r) => r.id)).toEqual(['db']);

    const noRedis = planMigration(inventory(rs), target(), { engines: engines(), exclude: ['redis'] });
    expect(noRedis.moving.map((r) => r.id)).toEqual(['db']);
  });
});

describe('the absolute-URL trap', () => {
  const both = () =>
    inventory([
      resource({ kind: 'postgres', id: 'db', name: 'app' }),
      resource({ kind: 'object-storage', id: 'b1', name: 'public' }),
    ]);

  it('warns when storage and a database move together with no rewrite host', () => {
    const plan = planMigration(both(), target(), { engines: engines() });
    expect(plan.risks.some((r) => /absolute URLs/i.test(r.message))).toBe(true);
    expect(plan.steps.some((s) => s.id === 'rewrite:urls')).toBe(true);
  });

  it('does not warn once a rewrite host is given', () => {
    const plan = planMigration(both(), target(), {
      engines: engines(),
      rewriteHosts: ['abc.supabase.co'],
    });
    expect(plan.risks.some((r) => /no --rewrite-host/i.test(r.message))).toBe(false);
    const step = plan.steps.find((s) => s.id === 'rewrite:urls');
    expect(step?.title).toContain('abc.supabase.co');
  });

  it('adds no rewrite step when only storage moves', () => {
    const plan = planMigration(
      inventory([resource({ kind: 'object-storage', id: 'b1', name: 'public' })]),
      target(),
      { engines: engines() },
    );
    expect(plan.steps.some((s) => s.id === 'rewrite:urls')).toBe(false);
  });
});

describe('phase ordering is the safety property', () => {
  const planWithCron = () =>
    planMigration(
      inventory([
        resource({ kind: 'postgres', id: 'db', name: 'app' }),
        resource({ kind: 'cron', id: 'jobs', name: 'pg_cron' }),
      ]),
      target(),
      { engines: engines() },
    );

  it('never schedules a phase before an earlier one', () => {
    const steps = planWithCron().steps;
    const idx = steps.map((s) => PHASES.indexOf(s.phase));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });

  it('stops scheduled jobs on the source before starting them on the target', () => {
    const steps = planWithCron().steps;
    const disable = steps.findIndex((s) => s.id === 'disable:jobs');
    const enable = steps.findIndex((s) => s.id === 'enable:jobs');
    expect(disable).toBeGreaterThanOrEqual(0);
    expect(enable).toBeGreaterThan(disable);
  });

  it('cuts DNS over only after the freeze and the delta', () => {
    const steps = planWithCron().steps;
    const at = (id: string) => steps.findIndex((s) => s.id === id);
    expect(at('freeze:all')).toBeLessThan(at('cutover:dns'));
    expect(at('delta:db')).toBeLessThan(at('cutover:dns'));
  });

  it('marks the steps that touch the live source', () => {
    const freeze = planWithCron().steps.find((s) => s.id === 'freeze:all');
    expect(freeze?.touchesSource).toBe(true);
  });
});

describe('orderSteps', () => {
  const step = (id: string, phase: Phase, after: string[] = []): Step => ({
    id,
    phase,
    title: id,
    after,
  });

  it('respects dependencies inside a phase', () => {
    const out = orderSteps([
      step('b', 'bulk', ['a']),
      step('a', 'bulk'),
      step('c', 'bulk', ['b']),
    ]);
    expect(out.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('throws on a cycle rather than guessing an order', () => {
    expect(() => orderSteps([step('a', 'bulk', ['b']), step('b', 'bulk', ['a'])])).toThrow(/cycle/);
  });

  it('throws when a step depends on one that runs in a later phase', () => {
    expect(() => orderSteps([step('a', 'bulk', ['z']), step('z', 'verify')])).toThrow(/runs later/);
  });

  it('ignores a dependency on a step that does not exist', () => {
    expect(() => orderSteps([step('a', 'bulk', ['nope'])])).not.toThrow();
  });
});

describe('secrets never reach the plan', () => {
  it('describes a connection without revealing it', () => {
    const s = secret('postgres://user:hunter2@db.example.com:5432/app');
    expect(s.describe()).not.toContain('hunter2');
    expect(s.describe()).toContain('db.example.com');
    expect(s.reveal()).toContain('hunter2');
  });

  it('masks a bare token', () => {
    expect(secret('abcdef123456').describe()).toBe('abcd***');
    expect(secret('ab').describe()).toBe('***');
  });

  it('leaves a non-secret alone', () => {
    expect(plain('my-bucket').describe()).toBe('my-bucket');
  });

  it('renders a plan with no credential in it', () => {
    const text = renderPlan(
      planMigration(
        inventory([
          resource({
            kind: 'postgres',
            id: 'db',
            name: 'app',
            connection: { url: secret('postgres://user:hunter2@h/db') },
          }),
        ]),
        target(),
        { engines: engines() },
      ),
    );
    expect(text).not.toContain('hunter2');
  });
});

describe('humanBytes', () => {
  it('scales through the units', () => {
    expect(humanBytes(512)).toBe('512 B');
    expect(humanBytes(4_700_000_000)).toBe('4.4 GB');
    expect(humanBytes(0)).toBe('0 B');
  });
});
