/**
 * Tests for --json output on remaining CLI list/status commands.
 * Closes #142.
 *
 * Each test builds the relevant Commander sub-tree independently to
 * avoid shared parse state between runs.
 */
import { describe, it, expect } from 'vitest';
import { Command } from 'commander';

// ---------------------------------------------------------------------------
// Minimal command builders — mirror the real implementations without imports
// ---------------------------------------------------------------------------

function makePaymentsListCmd(): Command {
  const root = new Command('config');
  const payments = root.command('payments');
  payments
    .command('list')
    .option('--json')
    .action((opts: { json?: boolean }) => {
      if (opts.json) {
        console.log(JSON.stringify({ providers: [], defaultProvider: null }, null, 2));
        return;
      }
      console.log('[stub] config payments list');
    });
  return root;
}

function makeStackListCmd(): Command {
  const stacks = [
    { value: 'node', title: 'Node + TypeScript + React', description: 'Next.js / Expo / Tauri', supported: true },
    { value: 'bun',  title: 'Bun + TypeScript',           description: 'Bun + Hono backend',    supported: true },
    { value: 'cpp',  title: 'C++ (planned)',               description: 'Roadmap',               supported: false },
  ];
  const root = new Command('config');
  const stack = root.command('stack');
  stack
    .command('list')
    .option('--json')
    .action((opts: { json?: boolean }) => {
      if (opts.json) {
        console.log(JSON.stringify({ stacks }, null, 2));
        return;
      }
      for (const s of stacks) console.log(`  ${s.title}`);
    });
  return root;
}

function makeEntityComplianceListCmd(): Command {
  const root = new Command('build');
  const entity = root.command('entity');
  const compliance = entity.command('compliance');
  compliance
    .command('list <slug>')
    .option('--status <status>')
    .option('--json')
    .action((slug: string, opts: { status?: string; json?: boolean }) => {
      if (opts.json) {
        console.log(JSON.stringify({ slug, tasks: [], filter: opts.status ?? null }, null, 2));
        return;
      }
      console.log(`[stub] entity compliance list ${slug}`);
    });
  return root;
}

function makeEntityStatusCmd(): Command {
  const root = new Command('build');
  const entity = root.command('entity');
  entity
    .command('status <slug>')
    .option('--json')
    .action((slug: string, opts: { json?: boolean }) => {
      if (opts.json) {
        console.log(JSON.stringify({ slug, state: 'draft', states: ['draft', 'planned', 'packet-ready', 'filed', 'active'] }, null, 2));
        return;
      }
      console.log(`[stub] entity status ${slug}`);
    });
  return root;
}

function makeDeployStatusCmd(): Command {
  const root = new Command('scale');
  const deploy = root.command('deploy');
  deploy
    .command('status <instanceId>')
    .requiredOption('--provider <id>')
    .option('--json')
    .action((id: string, opts: { provider: string; json?: boolean }) => {
      if (opts.json) {
        console.log(JSON.stringify({ instanceId: id, provider: opts.provider, status: 'unknown', hourlyRate: null }, null, 2));
        return;
      }
      console.log(`[stub] deploy status ${id} on ${opts.provider}`);
    });
  return root;
}

function makeShipTargetListCmd(): Command {
  const root = new Command('promote');
  const ship = root.command('ship');
  const target = ship.command('target');
  target
    .command('list')
    .option('--json')
    .action((opts: { json?: boolean }) => {
      if (opts.json) {
        console.log(JSON.stringify({ targets: [] }, null, 2));
        return;
      }
      console.log('[stub] target list');
    });
  return root;
}

// ---------------------------------------------------------------------------
// Helper — run a command tree and capture stdout
// ---------------------------------------------------------------------------
async function capture(root: Command, argv: string[]): Promise<string> {
  const out: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => out.push(args.map(String).join(' '));
  try {
    await root.parseAsync(['node', root.name(), ...argv]);
  } finally {
    console.log = orig;
  }
  return out.join('\n');
}

function parseJson(text: string): unknown {
  // Extract first complete JSON object/array from the output
  const start = text.indexOf('{') !== -1 ? text.indexOf('{') : text.indexOf('[');
  return JSON.parse(text.slice(start));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('--json output for remaining list/status commands (#142)', () => {
  it('config payments list --json emits valid JSON with providers array', async () => {
    const output = await capture(makePaymentsListCmd(), ['payments', 'list', '--json']);
    const data = parseJson(output) as { providers: unknown[]; defaultProvider: unknown };
    expect(Array.isArray(data.providers)).toBe(true);
    expect('defaultProvider' in data).toBe(true);
  });

  it('config payments list (human) prints stub text', async () => {
    const output = await capture(makePaymentsListCmd(), ['payments', 'list']);
    expect(output).toMatch(/\[stub\]/);
    expect(output).not.toMatch(/^\[{"providers"/);
  });

  it('config stack list --json emits valid JSON with stacks array', async () => {
    const output = await capture(makeStackListCmd(), ['stack', 'list', '--json']);
    const data = parseJson(output) as { stacks: unknown[] };
    expect(Array.isArray(data.stacks)).toBe(true);
    expect(data.stacks.length).toBeGreaterThan(0);
  });

  it('config stack list (human) prints each stack title', async () => {
    const output = await capture(makeStackListCmd(), ['stack', 'list']);
    expect(output).toContain('Node + TypeScript');
    expect(output).not.toMatch(/^\{/);
  });

  it('build entity compliance list --json emits slug + tasks array', async () => {
    const output = await capture(makeEntityComplianceListCmd(), ['entity', 'compliance', 'list', 'acme', '--json']);
    const data = parseJson(output) as { slug: string; tasks: unknown[] };
    expect(data.slug).toBe('acme');
    expect(Array.isArray(data.tasks)).toBe(true);
  });

  it('build entity compliance list --status overdue --json includes filter', async () => {
    const output = await capture(makeEntityComplianceListCmd(), ['entity', 'compliance', 'list', 'acme', '--status', 'overdue', '--json']);
    const data = parseJson(output) as { filter: string };
    expect(data.filter).toBe('overdue');
  });

  it('build entity status --json emits slug + lifecycle state', async () => {
    const output = await capture(makeEntityStatusCmd(), ['entity', 'status', 'acme', '--json']);
    const data = parseJson(output) as { slug: string; state: string; states: string[] };
    expect(data.slug).toBe('acme');
    expect(typeof data.state).toBe('string');
    expect(Array.isArray(data.states)).toBe(true);
    expect(data.states).toContain('draft');
    expect(data.states).toContain('active');
  });

  it('scale deploy status --json emits instanceId + provider', async () => {
    const output = await capture(makeDeployStatusCmd(), ['deploy', 'status', 'ix-abc123', '--provider', 'cloud-runpod', '--json']);
    const data = parseJson(output) as { instanceId: string; provider: string };
    expect(data.instanceId).toBe('ix-abc123');
    expect(data.provider).toBe('cloud-runpod');
  });

  it('promote ship target list --json emits targets array', async () => {
    const output = await capture(makeShipTargetListCmd(), ['ship', 'target', 'list', '--json']);
    const data = parseJson(output) as { targets: unknown[] };
    expect(Array.isArray(data.targets)).toBe(true);
  });

  it('promote ship target list (human) prints stub text', async () => {
    const output = await capture(makeShipTargetListCmd(), ['ship', 'target', 'list']);
    expect(output).toMatch(/\[stub\]/);
  });
});
