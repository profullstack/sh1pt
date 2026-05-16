import { Command } from 'commander';
import kleur from 'kleur';
import { describeInput, resolveInput } from '../input.js';
import { deployCmd } from './deploy.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

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

export const scaleCmd = new Command('scale')
  .description('Provision + scale cloud infra. DNS round-robin, rollouts, rightsizing — all the capacity ops.')
  .option('--from <input>', 'existing live url, repo, or local path to probe + propose scaling for')
  .action((opts: { from?: string }) => {
    if (opts.from) {
      const input = resolveInput(opts.from);
      console.log(kleur.green(`[stub] scale probe · from=${describeInput(input)}`));
      // TODO: kind==='url' → DNS/HTTP probe (region(s), provider heuristics, TTFB);
      // kind==='git' → parse IaC/Dockerfile/infra manifests; kind==='path'/'doc' → read
      // local manifest. Output: current fleet inference + scale-up/down recommendations.
      return;
    }
    scaleCmd.help();
  });

// Raw infra provisioning lives under scale (was top-level `sh1pt deploy`).
// sh1pt scale deploy [setup|quote|provision|list|destroy|status]
scaleCmd.addCommand(deployCmd);

scaleCmd
  .command('up')
  .description('Buy more instances of the current SKU (via sh1pt deploy under the hood)')
  .option('--instances <n>', 'how many to add', Number)
  .option('--provider <id>', 'which cloud provider to add to (default: same as existing fleet)')
  .option('--max-hourly-price <usd>', 'abort if the new instances would push above this total/hr', Number)
  .action((opts) => {
    console.log(kleur.green(`[stub] scale up ${JSON.stringify(opts)}`));
    // TODO: resolve current fleet, call CloudProvider.provision() × N,
    // then DnsProvider.syncRoundRobin() with the new IP list.
  });

scaleCmd
  .command('down')
  .description('Tear down instances (cheapest / least-healthy first)')
  .option('--instances <n>', 'number of instances to destroy', Number)
  .option('--provider <id>', 'cloud provider id')
  .action((opts) => {
    console.log(kleur.yellow(`[stub] scale down ${JSON.stringify(opts)}`));
    // TODO: pick N victims, CloudProvider.destroy() each, syncRoundRobin() with remaining IPs
  });

scaleCmd
  .command('auto')
  .description('Set auto-scale rules (sh1pt cloud polls metrics and runs scale up/down on your behalf)')
  .option('--min <n>', 'minimum instances', Number, 1)
  .option('--max <n>', 'maximum instances', Number, 10)
  .option('--target-cpu <percent>', 'target CPU utilization to maintain', Number, 70)
  .option('--cooldown <seconds>', 'minimum time between scale events', Number, 300)
  .action((opts) => {
    console.log(kleur.cyan(`[stub] scale auto ${JSON.stringify(opts)}`));
    // TODO: PUT /v1/scale/rules — sh1pt cloud evaluates periodically
  });

scaleCmd
  .command('dns')
  .description('Wire round-robin DNS so traffic spreads across the fleet')
  .requiredOption('--provider <id>', 'dns-porkbun | dns-cloudflare')
  .requiredOption('--domain <fqdn>', 'e.g. api.example.com')
  .option('--ttl <seconds>', '', Number, 60)
  .option('--proxied', 'cloudflare only — route through the CF edge (orange cloud)')
  .action((opts) => {
    console.log(kleur.cyan(`[stub] scale dns ${JSON.stringify(opts)}`));
    // TODO: resolve fleet IPs, call DnsProvider.syncRoundRobin({ name, ips, ttl, proxied })
  });

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
    // Status mode
    if (opts.status) {
      const rs = loadRollouts();
      if (rs.rollouts.length === 0) {
        console.log(kleur.dim('No rollouts recorded.'));
        return;
      }
      const active = rs.rollouts.filter(r => r.status === 'in-progress');
      if (opts.json) {
        console.log(JSON.stringify(rs, null, 2));
        return;
      }
      console.log(kleur.bold(`\\n📋 Rollout History (${rs.rollouts.length} total)`));
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
      console.log(kleur.bold('\\n⏮ Rollback Plan'));
      console.log(kleur.dim('─'.repeat(56)));
      console.log(`${kleur.cyan('Rollout ID:'.padEnd(20))} ${target.id.slice(0, 8)} (v${target.version})`);
      console.log(`${kleur.cyan('Affected instances:'.padEnd(20))} ${target.newInstanceIds.length}`);
      console.log(`${kleur.cyan('IPs:'.padEnd(20))} ${oldIps.join(', ') || '(none)'}`);
      console.log(kleur.dim('─'.repeat(56)));
      if (opts.dryRun) {
        console.log(kleur.dim('Dry-run — no changes made.'));
        return;
      }
      // Mark new instances as stopped, set status
      for (const inst of fleet.instances) {
        if (target.newInstanceIds.includes(inst.id)) {
          inst.status = 'stopped';
        }
      }
      if (opts.strategy === 'blue-green') {
        // Reactivate old instances
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
      console.log(kleur.green(`\\n✅ Rolled back rollout ${target.id.slice(0, 8)} (v${target.version}).`));
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

    // Per-strategy planning
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

    // Simulate provisioning new instances
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

    // Report plan
    console.log(kleur.bold('\\n🚀 Rollout Plan'));
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
      console.log(kleur.dim('Dry-run — no changes made.'));
      return;
    }

    // Execute
    fleet.instances.push(...newInstances);

    // For rolling: stop old instances rotationally (simulate replacement)
    if (strategy === 'rolling') {
      const toStop = running.slice(0, newInstanceCount);
      for (const old of toStop) {
        const idx = fleet.instances.findIndex(i => i.id === old.id);
        if (idx >= 0) fleet.instances[idx]!.status = 'stopped';
      }
    }

    // For blue-green: stop all old instances
    if (strategy === 'blue-green') {
      for (const old of running) {
        const idx = fleet.instances.findIndex(i => i.id === old.id);
        if (idx >= 0) fleet.instances[idx]!.status = 'stopped';
      }
    }

    saveFleet(fleet);

    // Record rollout
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

    console.log(kleur.green(`\\n✅ Rollout ${rolloutId} started: ${note}`));
    console.log(kleur.dim(`New instances: ${newInstances.map(i => i.publicIp).join(', ')}`));
    if (strategy === 'canary') {
      console.log(kleur.yellow('Monitor and then run `sh1pt scale rollout --rollback <id>` if needed.'));
    } else if (strategy === 'blue-green') {
      console.log(kleur.dim('Old fleet is stopped. Run `sh1pt scale rollout --rollback <id>` to cut back.'));
    } else {
      console.log(kleur.dim(`Remaining: ${running.length - newInstanceCount} instance(s) to replace in next batch.`));
    }
  });

scaleCmd
  .command('cost')
  .description('Current spend, per-provider breakdown, and rightsizing suggestions')
  .option('--json')
  .action((opts: { json?: boolean }) => {
    if (opts.json) {
      console.log(JSON.stringify({ hourly: 0, monthly: 0, byProvider: {}, suggestions: [] }, null, 2));
      return;
    }
    console.log(kleur.dim('[stub] scale cost — hourly/monthly + rightsizing hints'));
    // TODO: aggregate Instance.hourlyRate across fleet; compare utilization
    // vs SKU size; suggest downsizing underused boxes or moving to spot/reserved.
  });

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
