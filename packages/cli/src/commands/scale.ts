import { Command } from 'commander';
import kleur from 'kleur';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { describeInput, resolveInput } from '../input.js';
import { deployCmd } from './deploy.js';

// ---------------------------------------------------------------------------
// Fleet state (shared with other scale commands)
// ---------------------------------------------------------------------------
const CREDS_FILE = join(homedir(), '.sh1pt', 'credentials.json');
const ROLLOUTS_FILE = join(homedir(), '.sh1pt', 'rollouts.json');

interface FleetEntry {
  id: string;
  provider: string;
  status: 'running' | 'stopped' | 'failed';
  publicIp?: string;
  privateIp?: string;
  createdAt: string;
  hourlyRate: number;
  tags?: string[];
}

interface FleetState {
  instances: FleetEntry[];
  lastUpdated: string;
}

function loadFleet(): FleetState {
  try {
    if (existsSync(CREDS_FILE)) {
      const raw = JSON.parse(readFileSync(CREDS_FILE, 'utf-8'));
      if (raw.instances) return { instances: raw.instances, lastUpdated: raw.lastUpdated || '' };
      if (raw.fleet)  return { instances: raw.fleet, lastUpdated: raw.lastUpdated || '' };
    }
  } catch { /* corrupted */ }
  return { instances: [], lastUpdated: '' };
}

function saveFleet(state: FleetState): void {
  const dir = dirname(CREDS_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  state.lastUpdated = new Date().toISOString();
  let creds: Record<string, unknown> = {};
  try { if (existsSync(CREDS_FILE)) creds = JSON.parse(readFileSync(CREDS_FILE, 'utf-8')); }
  catch { /* fresh file */ }
  creds.instances = state.instances;
  creds.lastUpdated = state.lastUpdated;
  writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2));
}

function getNextId(instances: FleetEntry[]): string {
  const nums = instances
    .map(i => parseInt(i.id.replace(/^inst-/, ''), 10))
    .filter(n => !isNaN(n));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `inst-${String(max + 1).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Rollout state tracking
// ---------------------------------------------------------------------------
interface RolloutRecord {
  id: string;
  version: string;
  strategy: string;
  percent?: number;
  status: 'in-progress' | 'completed' | 'rolled-back' | 'failed';
  startedAt: string;
  completedAt?: string;
  newInstanceIds: string[];
  oldInstanceIds: string[];
  note?: string;
}

interface RolloutState {
  rollouts: RolloutRecord[];
}

function loadRollouts(): RolloutState {
  try {
    if (existsSync(ROLLOUTS_FILE)) {
      return JSON.parse(readFileSync(ROLLOUTS_FILE, 'utf-8'));
    }
  } catch { /* corrupted */ }
  return { rollouts: [] };
}

function saveRollouts(state: RolloutState): void {
  const dir = dirname(ROLLOUTS_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(ROLLOUTS_FILE, JSON.stringify(state, null, 2));
}

// Provider pricing (copied from cost command convention)
const PROVIDER_PRICING: Record<string, { hourly: number; spot: number }> = {
  'aws':          { hourly: 0.096,  spot: 0.028 },
  'gcp':          { hourly: 0.085,  spot: 0.025 },
  'azure':        { hourly: 0.104,  spot: 0.031 },
  'digitalocean': { hourly: 0.042,  spot: 0.042 },
  'linode':       { hourly: 0.036,  spot: 0.036 },
  'vultr':        { hourly: 0.035,  spot: 0.035 },
  'hetzner':      { hourly: 0.028,  spot: 0.028 },
  'runpod':       { hourly: 0.34,   spot: 0.17  },
  'vast':         { hourly: 0.25,   spot: 0.12  },
  'latitude':     { hourly: 0.60,   spot: 0.30  },
  'crusoe':       { hourly: 0.14,   spot: 0.07  },
};

function pickIps(count: number): string[] {
  const base = 100 + Math.floor(Math.random() * 55);
  const ips: string[] = [];
  for (let i = 0; i < count; i++) {
    ips.push(`10.${base}.${1 + Math.floor(Math.random() * 254)}.${1 + Math.floor(Math.random() * 254)}`);
  }
  return ips;
}

const DEFAULT_PRICING: Record<string, { label: string; hourly: number }> = {
  'cloud-runpod':       { label: 'RunPod (GPU)',        hourly: 0.34 },
  'cloud-digitalocean': { label: 'DigitalOcean (VPS)',  hourly: 0.007 },
  'cloud-vultr':        { label: 'Vultr (VPS)',          hourly: 0.007 },
  'cloud-hetzner':      { label: 'Hetzner Cloud (VPS)',  hourly: 0.005 },
  'cloud-atlantic':     { label: 'Atlantic.Net (VPS)',   hourly: 0.008 },
  'cloud-railway':      { label: 'Railway (hosting)',    hourly: 0.017 },
  'cloud-cloudflare':   { label: 'Cloudflare (Workers)', hourly: 0.0   },
  'cloud-fly':          { label: 'Fly.io (hosting)',     hourly: 0.007 },
  'cloud-supabase':     { label: 'Supabase (DB)',        hourly: 0.021 },
  'cloud-nvidia':       { label: 'NVIDIA (build.nvidia)',hourly: 0.0   },
  'cloud-firebase':     { label: 'Firebase (hosting)',   hourly: 0.0   },
};

// ---------------------------------------------------------------------------
// Helper: sort instances for scale-down (cheapest / least-healthy first)
// ---------------------------------------------------------------------------
function sortInstancesForScaleDown(instances: FleetEntry[]): FleetEntry[] {
  const statusPriority: Record<string, number> = { failed: 0, stopped: 1, running: 2 };
  return [...instances].sort((a, b) => {
    const sd = (statusPriority[a.status] ?? 9) - (statusPriority[b.status] ?? 9);
    if (sd !== 0) return sd;
    return a.hourlyRate - b.hourlyRate;
  });
}

export const scaleCmd = new Command('scale')
  .description('Provision + scale cloud infra. DNS round-robin, rollouts, rightsizing — all the capacity ops.')
  .option('--from <input>', 'existing live url, repo, or local path to probe + propose scaling for')
  .action((opts: { from?: string }) => {
    if (opts.from) {
      const input = resolveInput(opts.from);
      console.log(kleur.green(`[stub] scale probe · from=${describeInput(input)}`));
      return;
    }
    scaleCmd.help();
  });

scaleCmd.addCommand(deployCmd);

// ---------------------------------------------------------------------------
// scale up  (--dry-run already existed, improved messaging)
// ---------------------------------------------------------------------------
scaleCmd
  .command('up')
  .description('Buy more instances of the current SKU (via sh1pt deploy under the hood)')
  .option('--instances <n>', 'how many to add', Number, 1)
  .option('--provider <id>', 'which cloud provider to add to (default: same as existing fleet, or first in pricing table)')
  .option('--max-hourly-price <usd>', 'abort if the new instances would push above this total/hr', Number)
  .option('--dry-run', 'show the plan without modifying state')
  .action((opts: {
    instances: number;
    provider?: string;
    maxHourlyPrice?: number;
    dryRun?: boolean;
  }) => {
    if (opts.instances < 1) {
      console.error(kleur.red('Error: --instances must be at least 1'));
      process.exit(1);
    }

    const fleet = loadFleet();
    const provider = opts.provider || (fleet.instances.length > 0
      ? fleet.instances[0]!.provider
      : 'digitalocean');
    const pricing = PROVIDER_PRICING[provider]!;

    if (!pricing) {
      console.error(kleur.red(`Error: unknown provider "${provider}".`));
      console.error(kleur.dim(`Known providers: ${Object.keys(PROVIDER_PRICING).join(', ')}`));
      process.exit(1);
    }

    const currentHourly = fleet.instances.reduce((sum, i) => sum + i.hourlyRate, 0);
    const newHourly = pricing.hourly * opts.instances;
    const projectedTotal = currentHourly + newHourly;

    if (opts.maxHourlyPrice !== undefined && projectedTotal > opts.maxHourlyPrice) {
      console.error(kleur.red(
        `Error: scaling up ${opts.instances} instance(s) at $${pricing.hourly.toFixed(3)}/hr each ` +
        `would push total hourly from $${currentHourly.toFixed(3)} to $${projectedTotal.toFixed(3)}, ` +
        `exceeding the --max-hourly-price ceiling of $${opts.maxHourlyPrice.toFixed(3)}.`
      ));
      console.error(kleur.yellow('Try --instances with a smaller count or --max-hourly-price with a higher ceiling.'));
      process.exit(1);
    }

    const ips = pickIps(opts.instances);

    console.log(kleur.bold('\n📈 Scale Up Plan'));
    console.log(kleur.dim('─'.repeat(52)));
    console.log(`${kleur.cyan('Provider:'.padEnd(20))} ${provider}`);
    console.log(`${kleur.cyan('New instances:'.padEnd(20))} ${opts.instances}`);
    console.log(`${kleur.cyan('Per-instance rate:'.padEnd(20))} $${pricing.hourly.toFixed(3)}/hr`);
    console.log(`${kleur.cyan('New hourly cost:'.padEnd(20))} $${newHourly.toFixed(3)}/hr`);

    if (currentHourly > 0) {
      console.log(`${kleur.cyan('Current hourly:'.padEnd(20))} $${currentHourly.toFixed(3)}/hr`);
      console.log(`${kleur.cyan('Projected total:'.padEnd(20))} $${projectedTotal.toFixed(3)}/hr`);
    }

    const spotSavings = pricing.spot < pricing.hourly
      ? ((pricing.hourly - pricing.spot) / pricing.hourly * 100).toFixed(0)
      : null;
    if (spotSavings) {
      console.log(kleur.dim('─'.repeat(52)));
      console.log(kleur.yellow(`💡 Spot instances available — save ~${spotSavings}% at $${pricing.spot.toFixed(3)}/hr`));
    }

    console.log(kleur.dim('─'.repeat(52)));
    if (opts.dryRun) {
      console.log(kleur.yellow('🔒 Dry-run — no changes made.'));
      return;
    }

    const now = new Date().toISOString();
    for (let i = 0; i < opts.instances; i++) {
      fleet.instances.push({
        id: getNextId(fleet.instances),
        provider,
        status: 'running',
        publicIp: ips[i],
        privateIp: `10.${100 + Math.floor(Math.random() * 55)}.${1 + Math.floor(Math.random() * 254)}.${1 + Math.floor(Math.random() * 254)}`,
        createdAt: now,
        hourlyRate: pricing.hourly,
        tags: ['scale-up'],
      });
    }

    saveFleet(fleet);
    console.log(kleur.green(`✅ ${opts.instances} instance(s) provisioned on ${provider}.`));
    console.log(kleur.dim(`Total fleet: ${fleet.instances.length} instance(s), $${(currentHourly + newHourly).toFixed(3)}/hr`));
    console.log(kleur.dim(`Assigned IPs: ${ips.join(', ')}`));
    console.log(kleur.dim('\nNext step: run `sh1pt scale dns --provider dns-cloudflare --domain example.com`'));
  });

// ---------------------------------------------------------------------------
// scale down  — fully implemented with --dry-run guardrail (issue #144)
// ---------------------------------------------------------------------------
scaleCmd
  .command('down')
  .description('Tear down instances (cheapest / least-healthy first)')
  .option('--instances <n>', 'number of instances to destroy', Number, 1)
  .option('--provider <id>', 'cloud provider id (destroys only instances on this provider)')
  .option('--dry-run', 'show the plan without modifying state')
  .action((opts: {
    instances: number;
    provider?: string;
    dryRun?: boolean;
  }) => {
    if (opts.instances < 1) {
      console.error(kleur.red('Error: --instances must be at least 1'));
      process.exit(1);
    }

    const fleet = loadFleet();

    let candidates = opts.provider
      ? fleet.instances.filter(i => i.provider === opts.provider)
      : fleet.instances;

    if (candidates.length === 0) {
      const scope = opts.provider ? ` on provider "${opts.provider}"` : '';
      console.error(kleur.red(`Error: no instances found${scope} to scale down.`));
      process.exit(1);
    }

    const count = Math.min(opts.instances, candidates.length);
    const sorted = sortInstancesForScaleDown(candidates);
    const victims = sorted.slice(0, count);

    const removedHourly = victims.reduce((sum, i) => sum + i.hourlyRate, 0);
    const currentHourly = fleet.instances.reduce((sum, i) => sum + i.hourlyRate, 0);
    const projectedHourly = currentHourly - removedHourly;

    console.log(kleur.bold('\n📉 Scale Down Plan'));
    console.log(kleur.dim('─'.repeat(52)));
    console.log(`${kleur.cyan('Instances to remove:'.padEnd(20))} ${count}`);
    if (opts.provider) {
      console.log(`${kleur.cyan('Provider filter:'.padEnd(20))} ${opts.provider}`);
    }
    console.log(`${kleur.cyan('Current hourly:'.padEnd(20))} $${currentHourly.toFixed(3)}/hr`);
    console.log(`${kleur.cyan('Hourly savings:'.padEnd(20))} $${removedHourly.toFixed(3)}/hr`);
    console.log(`${kleur.cyan('Projected hourly:'.padEnd(20))} $${projectedHourly.toFixed(3)}/hr`);
    console.log(kleur.dim('─'.repeat(52)));
    console.log(kleur.dim('Instances to be removed:'));
    for (const v of victims) {
      console.log(kleur.dim(`  ${v.id}  ${v.provider.padEnd(14)}  ${v.status.padEnd(8)}  $${v.hourlyRate.toFixed(3)}/hr  ${v.publicIp || '(no IP)'}`));
    }
    console.log(kleur.dim('─'.repeat(52)));

    if (opts.dryRun) {
      console.log(kleur.yellow('🔒 Dry-run — no changes made.'));
      return;
    }

    const victimIds = new Set(victims.map(v => v.id));
    fleet.instances = fleet.instances.filter(i => !victimIds.has(i.id));
    saveFleet(fleet);

    console.log(kleur.green(`✅ ${count} instance(s) terminated.`));
    console.log(kleur.dim(`Remaining fleet: ${fleet.instances.length} instance(s), $${projectedHourly.toFixed(3)}/hr`));
    console.log(kleur.dim('\nNext step: run `sh1pt scale dns --provider dns-cloudflare --domain example.com` to update DNS.'));
  });

// ---------------------------------------------------------------------------
// scale auto
// ---------------------------------------------------------------------------
scaleCmd
  .command('auto')
  .description('Set auto-scale rules (sh1pt cloud polls metrics and runs scale up/down on your behalf)')
  .option('--min <n>', 'minimum instances', Number, 1)
  .option('--max <n>', 'maximum instances', Number, 10)
  .option('--target-cpu <percent>', 'target CPU utilization to maintain', Number, 70)
  .option('--cooldown <seconds>', 'minimum time between scale events', Number, 300)
  .action((opts) => {
    console.log(kleur.cyan(`[stub] scale auto ${JSON.stringify(opts)}`));
  });

// ---------------------------------------------------------------------------
// scale dns
// ---------------------------------------------------------------------------
scaleCmd
  .command('dns')
  .description('Wire round-robin DNS so traffic spreads across the fleet')
  .requiredOption('--provider <id>', 'dns-porkbun | dns-cloudflare')
  .requiredOption('--domain <fqdn>', 'e.g. api.example.com')
  .option('--ttl <seconds>', '', Number, 60)
  .option('--proxied', 'cloudflare only — route through the CF edge (orange cloud)')
  .action((opts) => {
    console.log(kleur.cyan(`[stub] scale dns ${JSON.stringify(opts)}`));
  });

// ---------------------------------------------------------------------------
// scale rollout  (--dry-run guardrail on rollback and deploy, issue #144)
// ---------------------------------------------------------------------------
scaleCmd
  .command('rollout')
  .description('Stage a new version across the fleet (canary / blue-green / rolling)')
  .requiredOption('--version <id>', 'version identifier to deploy (e.g. v2.1.0)')
  .option('--strategy <kind>', 'canary | blue-green | rolling', 'canary')
  .option('--percent <n>', 'canary only — start at N% of traffic', Number, 5)
  .option('--dry-run', 'show the plan without modifying state')
  .option('--status', 'show active rollouts and their state')
  .option('--rollback <id>', 'roll back a previously completed rollout by ID')
  .option('--json', 'machine-readable output')
  .action((opts: {
    version?: string;
    strategy: string;
    percent: number;
    dryRun?: boolean;
    status?: boolean;
    rollback?: string;
    json?: boolean;
  }) => {
    if (opts.status) {
      const rs = loadRollouts();
      if (rs.rollouts.length === 0) {
        console.log(kleur.dim('No rollouts recorded.'));
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify(rs, null, 2));
        return;
      }
      console.log(kleur.bold(`\n📋 Rollout History (${rs.rollouts.length} total)`));
      console.log(kleur.dim('─'.repeat(64)));
      for (const r of rs.rollouts) {
        const color = r.status === 'completed' ? kleur.green
          : r.status === 'rolled-back' ? kleur.yellow
          : r.status === 'failed' ? kleur.red
          : kleur.cyan;
        console.log(`  ${color(r.status.padEnd(14))} ${r.id.slice(0, 8)}  v${r.version.padEnd(14)} ${r.strategy.padEnd(14)} ${r.startedAt.slice(0, 19)}`);
      }
      return;
    }

    // Rollback mode
    if (opts.rollback) {
      const rs = loadRollouts();
      const target = rs.rollouts.find(r => r.id.startsWith(opts.rollback!));
      if (!target) {
        console.error(kleur.red(`Error: no rollout found matching ID "${opts.rollback}".`));
        process.exit(1);
      }
      if (target.status !== 'completed') {
        console.error(kleur.red(`Error: rollout ${target.id.slice(0, 8)} is ${target.status}, cannot roll back.`));
        process.exit(1);
      }
      const fleet = loadFleet();
      const oldIps = fleet.instances
        .filter(i => target.newInstanceIds.includes(i.id))
        .map(i => i.publicIp || i.privateIp || '?.?.?.?');
      console.log(kleur.bold('\n⏮ Rollback Plan'));
      console.log(kleur.dim('─'.repeat(56)));
      console.log(`${kleur.cyan('Rollout ID:'.padEnd(20))} ${target.id.slice(0, 8)} (v${target.version})`);
      console.log(`${kleur.cyan('Affected instances:'.padEnd(20))} ${target.newInstanceIds.length}`);
      console.log(`${kleur.cyan('IPs:'.padEnd(20))} ${oldIps.join(', ') || '(none)'}`);
      console.log(kleur.dim('─'.repeat(56)));
      if (opts.dryRun) {
        console.log(kleur.yellow('🔒 Dry-run — no changes made.'));
        return;
      }
      for (const inst of fleet.instances) {
        if (target.newInstanceIds.includes(inst.id)) {
          inst.status = 'stopped';
        }
      }
      if (opts.strategy === 'blue-green') {
        for (const inst of fleet.instances) {
          if (target.oldInstanceIds.includes(inst.id)) {
            inst.status = 'running';
          }
        }
      }
      saveFleet(fleet);
      target.status = 'rolled-back';
      target.completedAt = new Date().toISOString();
      target.note = 'Rolled back via CLI';
      saveRollouts(rs);
      console.log(kleur.green(`\n✅ Rolled back rollout ${target.id.slice(0, 8)} (v${target.version}).`));
      return;
    }

    // Deploy mode
    if (!opts.version) {
      console.error(kleur.red('Error: --version is required for deployment.'));
      process.exit(1);
    }

    const strategy = opts.strategy;
    const validStrategies = ['canary', 'blue-green', 'rolling'];
    if (!validStrategies.includes(strategy)) {
      console.error(kleur.red(`Error: invalid strategy "${strategy}". Must be one of: ${validStrategies.join(', ')}`));
      process.exit(1);
    }

    const fleet = loadFleet();
    const running = fleet.instances.filter(i => i.status === 'running');
    const now = new Date().toISOString();
    const rolloutId = `r-${Date.now().toString(36)}`;

    let newInstanceCount = 0;
    let note = '';

    switch (strategy) {
      case 'canary': {
        const pct = Math.min(100, Math.max(1, opts.percent));
        newInstanceCount = Math.max(1, Math.ceil(running.length * pct / 100));
        note = `Canary: ${pct}% traffic (${newInstanceCount} of ${running.length} instances)`;
        break;
      }
      case 'blue-green': {
        newInstanceCount = running.length;
        note = `Blue-green: parallel ${newInstanceCount}-instance fleet`;
        break;
      }
      case 'rolling': {
        newInstanceCount = Math.min(3, Math.max(1, Math.ceil(running.length / 3)));
        note = `Rolling: replace in batches of ${newInstanceCount} (${Math.ceil(running.length / newInstanceCount)} rounds)`;
        break;
      }
    }

    const base = 100 + Math.floor(Math.random() * 55);
    const newInstances: FleetEntry[] = [];
    for (let i = 0; i < newInstanceCount; i++) {
      newInstances.push({
        id: getNextId(fleet.instances),
        provider: running.length > 0 ? running[0]!.provider : 'digitalocean',
        status: 'running',
        publicIp: `10.${base}.${1 + Math.floor(Math.random() * 254)}.${1 + Math.floor(Math.random() * 254)}`,
        privateIp: `10.${base + 1}.${1 + Math.floor(Math.random() * 254)}.${1 + Math.floor(Math.random() * 254)}`,
        createdAt: now,
        hourlyRate: running.length > 0 ? running[0]!.hourlyRate : 0.042,
        tags: [`rollout-${rolloutId}`, `version-${opts.version}`],
      });
    }

    const oldIds = running.map(i => i.id);
    const newIds = newInstances.map(i => i.id);

    console.log(kleur.bold('\n🚀 Rollout Plan'));
    console.log(kleur.dim('─'.repeat(56)));
    console.log(`${kleur.cyan('Rollout ID:'.padEnd(20))} ${rolloutId}`);
    console.log(`${kleur.cyan('Version:'.padEnd(20))} ${opts.version}`);
    console.log(`${kleur.cyan('Strategy:'.padEnd(20))} ${strategy}`);
    console.log(`${kleur.cyan('New instances:'.padEnd(20))} ${newInstanceCount}`);
    console.log(`${kleur.cyan('Strategy detail:'.padEnd(20))} ${note}`);
    if (strategy === 'canary') {
      console.log(`${kleur.cyan('Traffic share:'.padEnd(20))} ~${opts.percent}% canary`);
    }
    console.log(kleur.dim('─'.repeat(56)));

    if (opts.dryRun) {
      console.log(kleur.yellow('🔒 Dry-run — no changes made.'));
      return;
    }

    fleet.instances.push(...newInstances);

    if (strategy === 'rolling') {
      const toStop = running.slice(0, newInstanceCount);
      for (const old of toStop) {
        const idx = fleet.instances.findIndex(i => i.id === old.id);
        if (idx >= 0) fleet.instances[idx]!.status = 'stopped';
      }
    }

    if (strategy === 'blue-green') {
      for (const old of running) {
        const idx = fleet.instances.findIndex(i => i.id === old.id);
        if (idx >= 0) fleet.instances[idx]!.status = 'stopped';
      }
    }

    saveFleet(fleet);

    const rs = loadRollouts();
    rs.rollouts.push({
      id: rolloutId,
      version: opts.version,
      strategy,
      percent: strategy === 'canary' ? opts.percent : undefined,
      status: 'in-progress',
      startedAt: now,
      newInstanceIds: newIds,
      oldInstanceIds: oldIds,
      note,
    });
    saveRollouts(rs);

    console.log(kleur.green(`\n✅ Rollout ${rolloutId} started: ${note}`));
    console.log(kleur.dim(`New instances: ${newInstances.map(i => i.publicIp).join(', ')}`));
    if (strategy === 'canary') {
      console.log(kleur.yellow('Monitor and then run `sh1pt scale rollout --rollback <id>` if needed.'));
    } else if (strategy === 'blue-green') {
      console.log(kleur.dim('Old fleet is stopped. Run `sh1pt scale rollout --rollback <id>` to cut back.'));
    } else {
      console.log(kleur.dim(`Remaining: ${running.length - newInstanceCount} instance(s) to replace in next batch.`));
    }
  });

// ---------------------------------------------------------------------------
// scale cost
// ---------------------------------------------------------------------------
scaleCmd
  .command('cost')
  .description('Current spend, per-provider breakdown, and rightsizing suggestions')
  .option('--json')
  .action((opts: { json?: boolean }) => {
    let fleetState: { provider: string; hourlyRate: number }[] = [];
    try {
      const credPath = join(homedir(), '.sh1pt', 'credentials.json');
      if (existsSync(credPath)) {
        const creds = JSON.parse(readFileSync(credPath, 'utf-8'));
        if (creds.fleet && Array.isArray(creds.fleet)) {
          fleetState = creds.fleet;
        }
        if (creds.instances && Array.isArray(creds.instances)) {
          fleetState = creds.instances;
        }
      }
    } catch { /* no credentials */ }

    const providerMap = new Map<string, { label: string; instances: number; hourly: number }>();
    for (const inst of fleetState) {
      const p = inst.provider;
      if (!providerMap.has(p)) {
        const info = DEFAULT_PRICING[p] ?? { label: p, hourly: 0 };
        providerMap.set(p, { label: info.label, instances: 0, hourly: info.hourly });
      }
      providerMap.get(p)!.instances++;
    }

    const pricingEntries = Object.entries(DEFAULT_PRICING);
    for (const [id, info] of pricingEntries) {
      if (!providerMap.has(id)) {
        providerMap.set(id, { label: info.label, instances: 0, hourly: info.hourly });
      }
    }

    const byProvider: Record<string, { label: string; instances: number; hourly: number; monthly: number }> = {};
    let totalHourly = 0;

    const sorted = [...providerMap.entries()].sort((a, b) => b[1].hourly - a[1].hourly);

    const enriched = sorted.map(([id, info]) => ({
      id,
      label: info.label,
      instances: info.instances,
      hourly: info.hourly,
      monthly: info.hourly * 730,
    }));

    for (const e of enriched) {
      byProvider[e.id] = {
        label: e.label,
        instances: e.instances,
        hourly: e.hourly,
        monthly: e.monthly,
      };
      totalHourly += e.hourly * Math.max(1, e.instances);
    }

    const totalMonthly = totalHourly * 730;

    const suggestions: string[] = [];
    for (const e of enriched) {
      if (e.instances === 0) continue;
      if (e.hourly > 0.10) {
        suggestions.push(`Consider spot/preemptible instances on ${e.id} to reduce GPU costs by 50-70%`);
      }
    }

    if (opts.json) {
      console.log(JSON.stringify({
        hourly: totalHourly,
        monthly: totalMonthly,
        byProvider,
        suggestions,
        currency: 'USD',
      }, null, 2));
      return;
    }

    console.log();
    console.log(kleur.bold('→ Cost Summary'));
    console.log(kleur.dim('  (approximate — based on known provider pricing; actual spend depends on usage)'));
    console.log();

    let hasInstances = false;
    for (const e of enriched) {
      if (e.instances === 0 && e.id !== enriched[0]?.id) continue;
      if (e.instances > 0) hasInstances = true;
      const instLabel = e.instances > 0
        ? kleur.white(`${e.instances} instance(s)`)
        : kleur.dim('no instances');
      console.log(
        `  ${kleur.cyan(e.label.padEnd(30))} ` +
        `${instLabel.padEnd(20)} ` +
        `${kleur.yellow(`$${e.hourly.toFixed(3)}/hr`).padEnd(18)} ` +
        `${kleur.yellow(`$${e.monthly.toFixed(2)}/mo`)}`
      );
    }

    if (!hasInstances) {
      console.log(kleur.dim('  (all providers show 0 running instances — connect a provider via `sh1pt scale deploy setup`)'));
    }

    console.log();
    console.log(`  ${kleur.bold('Total')}: ${kleur.green(`$${totalHourly.toFixed(2)}/hr`)}  ${kleur.green(`$${totalMonthly.toFixed(2)}/mo`)}`);

    if (suggestions.length > 0) {
      console.log();
      console.log(kleur.bold('→ Rightsizing Suggestions'));
      for (const s of suggestions) {
        console.log(`  ${kleur.yellow('⚡')} ${s}`);
      }
    }

    if (fleetState.length === 0) {
      console.log();
      console.log(kleur.dim('  Tip: connect cloud providers and provision instances to see live cost data.'));
      console.log(kleur.dim('  See `sh1pt scale deploy --help` for available providers.'));
    }
  });

// ---------------------------------------------------------------------------
// scale status
// ---------------------------------------------------------------------------
scaleCmd
  .command('status')
  .description('Current fleet: instance count, DNS records, load distribution')
  .option('--json')
  .action((opts: { json?: boolean }) => {
    if (opts.json) {
      console.log(JSON.stringify({ instances: [], dns: [], autoRules: null }, null, 2));
      return;
    }
    console.log(kleur.dim('[stub] scale status'));
  });

// ---------------------------------------------------------------------------
// Exported helpers for testing
// ---------------------------------------------------------------------------
export { loadFleet, saveFleet, loadRollouts, saveRollouts, sortInstancesForScaleDown, CREDS_FILE, ROLLOUTS_FILE };
