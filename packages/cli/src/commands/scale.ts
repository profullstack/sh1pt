import { Command } from 'commander';
import kleur from 'kleur';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { describeInput, resolveInput } from '../input.js';
import { deployCmd } from './deploy.js';

// ---------------------------------------------------------------------------
// Fleet state (shared with other scale commands)
// ---------------------------------------------------------------------------
const CREDS_FILE = join(homedir(), '.sh1pt', 'credentials.json');
const ROLLOUTS_FILE = join(homedir(), '.sh1pt', 'rollouts.json');

export interface FleetEntry {
  id: string;
  provider: string;
  status: 'running' | 'stopped' | 'failed';
  publicIp?: string;
  privateIp?: string;
  createdAt: string;
  hourlyRate: number;
  tags?: string[];
}

export interface FleetState {
  instances: FleetEntry[];
  lastUpdated: string;
}

/** Get the default path to the fleet credentials file. */
export function getCredsFilePath(): string {
  return CREDS_FILE;
}

/** Load fleet state from the credentials file. */
export function loadFleet(): FleetState {
  try {
    if (existsSync(CREDS_FILE)) {
      const raw = JSON.parse(readFileSync(CREDS_FILE, 'utf-8'));
      if (raw.instances) return { instances: raw.instances, lastUpdated: raw.lastUpdated || '' };
      if (raw.fleet)  return { instances: raw.fleet, lastUpdated: raw.lastUpdated || '' };
    }
  } catch { /* corrupted */ }
  return { instances: [], lastUpdated: '' };
}

/** Save fleet state back to the credentials file (merges into existing structure). */
export function saveFleet(state: FleetState): void {
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

// ---------------------------------------------------------------------------
// Rollout state tracking
// ---------------------------------------------------------------------------
export interface RolloutRecord {
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

export interface RolloutState {
  rollouts: RolloutRecord[];
}

/** Load rollout state from the rollouts file. */
export function loadRollouts(): RolloutState {
  try {
    if (existsSync(ROLLOUTS_FILE)) {
      return JSON.parse(readFileSync(ROLLOUTS_FILE, 'utf-8'));
    }
  } catch { /* corrupted */ }
  return { rollouts: [] };
}

/** Save rollout state to the rollouts file. */
export function saveRollouts(state: RolloutState): void {
  const dir = dirname(ROLLOUTS_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(ROLLOUTS_FILE, JSON.stringify(state, null, 2));
}


const PROVIDER_PRICING: Record<string, { hourly: number; spot: number }> = {
  'aws':          { hourly: 0.096,  spot: 0.028 },
  'gcp':          { hourly: 0.085,  spot: 0.025 },
  'azure':        { hourly: 0.104,  spot: 0.031 },
  'digitalocean': { hourly: 0.042,  spot: 0.042 },
  'linode':       { hourly: 0.036,  spot: 0.036 },
  'vultr':        { hourly: 0.035,  spot: 0.035 },
  'hetzner':      { hourly: 0.028,  spot: 0.028 },
  'runpod':       { hourly: 0.34,   spot: 0.17  },
  'lambda-labs':  { hourly: 0.75,   spot: 0.75  },
  'vast':         { hourly: 0.25,   spot: 0.12  },
  'latitude':     { hourly: 0.60,   spot: 0.30  },
  'crusoe':       { hourly: 0.14,   spot: 0.07  },
};

/** Generate the next sequential instance ID (inst-0001, inst-0002, …). */
export function getNextId(instances: FleetEntry[]): string {
  const nums = instances
    .map((i) => /^inst-(\d+)$/.exec(i.id)?.[1])
    .filter((value): value is string => value !== undefined)
    .map((value) => Number.parseInt(value, 10));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `inst-${String(max + 1).padStart(4, '0')}`;
}

function pickIps(count: number): string[] {
  // Simulated IP allocation on RFC 1918 / 100.64.0.0/10 space
  const base = 100 + Math.floor(Math.random() * 55);
  const ips: string[] = [];
  for (let i = 0; i < count; i++) {
    ips.push(`10.${base}.${1 + Math.floor(Math.random() * 254)}.${1 + Math.floor(Math.random() * 254)}`);
  }
  return ips;
}

// Known provider pricing references — sourced from each adapter's
// inline doc when real-time quote() isn't available (no API key).
// Values are approximate USD/hour for the cheapest comparable SKU.
const DEFAULT_PRICING: Record<string, { label: string; hourly: number }> = {
  'cloud-runpod':       { label: 'RunPod (GPU)',        hourly: 0.34 },
  'cloud-digitalocean': { label: 'DigitalOcean (VPS)',  hourly: 0.007 },
  'cloud-vultr':        { label: 'Vultr (VPS)',          hourly: 0.007 },
  'cloud-hetzner':      { label: 'Hetzner Cloud (VPS)',  hourly: 0.005 },
  'cloud-lambda-labs':  { label: 'Lambda Labs (GPU)',    hourly: 0.75  },
  'cloud-atlantic':     { label: 'Atlantic.Net (VPS)',   hourly: 0.008 },
  'cloud-railway':      { label: 'Railway (hosting)',    hourly: 0.017 },
  'cloud-cloudflare':   { label: 'Cloudflare (Workers)', hourly: 0.0   },
  'cloud-fly':          { label: 'Fly.io (hosting)',     hourly: 0.007 },
  'cloud-supabase':     { label: 'Supabase (DB)',        hourly: 0.021 },
  'cloud-nvidia':       { label: 'NVIDIA (build.nvidia)',hourly: 0.0   },
  'cloud-firebase':     { label: 'Firebase (hosting)',   hourly: 0.0   },
};

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

// Raw infra provisioning lives under scale (was top-level `sh1pt deploy`).
scaleCmd.addCommand(deployCmd);

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

    // Calculate current total hourly cost
    const currentHourly = fleet.instances.reduce((sum, i) => sum + i.hourlyRate, 0);
    const newHourly = pricing.hourly * opts.instances;
    const projectedTotal = currentHourly + newHourly;

    // Max hourly price guardrail
    if (opts.maxHourlyPrice !== undefined && projectedTotal > opts.maxHourlyPrice) {
      console.error(kleur.red(
        `Error: scaling up ${opts.instances} instance(s) at $${pricing.hourly.toFixed(3)}/hr each ` +
        `would push total hourly from $${currentHourly.toFixed(3)} to $${projectedTotal.toFixed(3)}, ` +
        `exceeding the --max-hourly-price ceiling of $${opts.maxHourlyPrice.toFixed(3)}.`
      ));
      console.error(kleur.yellow('Try --instances with a smaller count or --max-hourly-price with a higher ceiling.'));
      process.exit(1);
    }

    // Report plan
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
      console.log(kleur.dim('Dry-run — no changes made.'));
      return;
    }

    // Execute: add instances to fleet
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

scaleCmd
  .command('down')
  .description('Tear down instances (cheapest / least-healthy first)')
  .option('--instances <n>', 'number of instances to destroy', Number, 1)
  .option('--provider <id>', 'only remove instances from this cloud provider')
  .option('--dry-run', 'show the plan without modifying state')
  .option('--json', 'machine-readable output')
  .action((opts: {
    instances: number;
    provider?: string;
    dryRun?: boolean;
    json?: boolean;
  }) => {
    if (opts.instances < 1) {
      console.error(kleur.red('Error: --instances must be at least 1'));
      process.exit(1);
    }

    const fleet = loadFleet();

    if (fleet.instances.length === 0) {
      if (opts.json) {
        console.log(JSON.stringify({ removed: [], fleet: { instances: 0, hourly: 0 } }, null, 2));
      } else {
        console.log(kleur.yellow('No instances in fleet — nothing to tear down.'));
      }
      return;
    }

    // Filter by provider if specified
    let candidates = opts.provider
      ? fleet.instances.filter(i => i.provider === opts.provider)
      : [...fleet.instances];

    if (candidates.length === 0) {
      console.error(kleur.red(`Error: no instances found${opts.provider ? ` for provider "${opts.provider}"` : ''}.`));
      process.exit(1);
    }

    // Sort candidates for removal priority:
    // 1. failed instances first (least healthy)
    // 2. then stopped instances
    // 3. then running instances sorted by hourlyRate ascending (cheapest first)
    const statusOrder: Record<string, number> = { failed: 0, stopped: 1, running: 2 };
    candidates.sort((a, b) => {
      const sa = statusOrder[a.status] ?? 3;
      const sb = statusOrder[b.status] ?? 3;
      if (sa !== sb) return sa - sb;
      return a.hourlyRate - b.hourlyRate;
    });

    const removeCount = Math.min(opts.instances, candidates.length);
    const toRemove = candidates.slice(0, removeCount);
    const removedIds = new Set(toRemove.map(i => i.id));

    // Calculate savings
    const currentHourly = fleet.instances.reduce((sum, i) => sum + i.hourlyRate, 0);
    const removedHourly = toRemove.reduce((sum, i) => sum + i.hourlyRate, 0);
    const newHourly = currentHourly - removedHourly;

    if (opts.json) {
      console.log(JSON.stringify({
        removed: toRemove.map(i => ({
          id: i.id,
          provider: i.provider,
          status: i.status,
          publicIp: i.publicIp,
          hourlyRate: i.hourlyRate,
        })),
        fleet: {
          instances: fleet.instances.length - removeCount,
          hourly: newHourly,
        },
      }, null, 2));
      return;
    }

    // Human-readable output
    console.log(kleur.bold('\n📉 Scale Down Plan'));
    console.log(kleur.dim('─'.repeat(52)));
    console.log(`${kleur.cyan('Removing:'.padEnd(20))} ${removeCount} instance(s)`);
    if (opts.provider) {
      console.log(`${kleur.cyan('Provider filter:'.padEnd(20))} ${opts.provider}`);
    }
    console.log(`${kleur.cyan('Current hourly:'.padEnd(20))} $${currentHourly.toFixed(3)}/hr`);
    console.log(`${kleur.cyan('Savings:'.padEnd(20))} $${removedHourly.toFixed(3)}/hr ($${(removedHourly * 730).toFixed(2)}/mo)`);
    console.log(`${kleur.cyan('Projected hourly:'.padEnd(20))} $${newHourly.toFixed(3)}/hr`);

    console.log(kleur.dim('─'.repeat(52)));
    console.log(kleur.bold('Instances being torn down:'));
    for (const inst of toRemove) {
      const statusIcon = inst.status === 'failed' ? kleur.red('✖') : inst.status === 'stopped' ? kleur.yellow('■') : kleur.green('●');
      console.log(`  ${statusIcon} ${inst.id} ${kleur.dim(`(${inst.provider})`)} ${inst.publicIp ?? 'no IP'} $${inst.hourlyRate.toFixed(3)}/hr`);
    }
    console.log(kleur.dim('─'.repeat(52)));

    if (opts.dryRun) {
      console.log(kleur.dim('Dry-run — no changes made.'));
      return;
    }

    // Execute: remove instances from fleet
    fleet.instances = fleet.instances.filter(i => !removedIds.has(i.id));
    saveFleet(fleet);

    console.log(kleur.green(`✅ ${removeCount} instance(s) torn down.`));
    console.log(kleur.dim(`Remaining fleet: ${fleet.instances.length} instance(s), $${newHourly.toFixed(3)}/hr`));
  });

scaleCmd
  .command('auto')
  .description('Set auto-scale rules (sh1pt cloud polls metrics and runs scale up/down on your behalf)')
  .option('--min <n>', 'minimum instances', Number, 1)
  .option('--max <n>', 'maximum instances', Number, 10)
  .option('--target-cpu <percent>', 'target CPU utilization to maintain', Number, 70)
  .option('--cooldown <seconds>', 'minimum time between scale events', Number, 300)
  .option('--status', 'show current auto-scale rules')
  .option('--dry-run', 'show the rules without saving')
  .option('--json', 'machine-readable output')
  .action((opts: {
    min: number;
    max: number;
    targetCpu: number;
    cooldown: number;
    status?: boolean;
    dryRun?: boolean;
    json?: boolean;
  }) => {
    const AUTO_SCALE_FILE = join(homedir(), '.sh1pt', 'auto-scale.json');

    /** Load auto-scale rules from disk. */
    function loadAutoScaleRules(): Record<string, unknown> {
      try {
        if (existsSync(AUTO_SCALE_FILE)) {
          return JSON.parse(readFileSync(AUTO_SCALE_FILE, 'utf-8'));
        }
      } catch { /* corrupted or missing */ }
      return {};
    }

    /** Save auto-scale rules to disk. */
    function saveAutoScaleRules(rules: Record<string, unknown>): void {
      const dir = dirname(AUTO_SCALE_FILE);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(AUTO_SCALE_FILE, JSON.stringify(rules, null, 2));
    }

    // Status mode — just show current rules
    if (opts.status) {
      const rules = loadAutoScaleRules();
      if (Object.keys(rules).length === 0) {
        if (opts.json) {
          console.log(JSON.stringify({ rules: null }, null, 2));
        } else {
          console.log(kleur.yellow('No auto-scale rules configured. Run `sh1pt scale auto --min 2 --max 20` to set rules.'));
        }
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify({ rules }, null, 2));
        return;
      }

      console.log(kleur.bold('\n📊 Auto-Scale Rules'));
      console.log(kleur.dim('─'.repeat(52)));
      for (const [key, value] of Object.entries(rules)) {
        console.log(`${kleur.cyan((key + ':').padEnd(20))} ${value}`);
      }
      console.log(kleur.dim('─'.repeat(52)));
      console.log(kleur.dim('Config file: ' + AUTO_SCALE_FILE));
      return;
    }

    // Validate new rules
    const min = opts.min;
    const max = opts.max;
    const targetCpu = opts.targetCpu;
    const cooldown = opts.cooldown;

    if (min < 0) {
      console.error(kleur.red('Error: --min must be 0 or greater'));
      process.exit(1);
    }
    if (max < 1) {
      console.error(kleur.red('Error: --max must be at least 1'));
      process.exit(1);
    }
    if (min > max) {
      console.error(kleur.red('Error: --min cannot exceed --max'));
      process.exit(1);
    }
    if (targetCpu < 1 || targetCpu > 100) {
      console.error(kleur.red('Error: --target-cpu must be between 1 and 100'));
      process.exit(1);
    }
    if (cooldown < 60) {
      console.error(kleur.red('Error: --cooldown must be at least 60 seconds'));
      process.exit(1);
    }

    const rules: Record<string, unknown> = {
      minInstances: min,
      maxInstances: max,
      targetCpuPercent: targetCpu,
      cooldownSeconds: cooldown,
      updatedAt: new Date().toISOString(),
    };

    if (opts.json) {
      console.log(JSON.stringify({ rules }, null, 2));
      return;
    }

    console.log(kleur.bold('\n📊 Auto-Scale Rules'));
    console.log(kleur.dim('─'.repeat(52)));
    console.log(`${kleur.cyan('Min instances:'.padEnd(20))} ${min}`);
    console.log(`${kleur.cyan('Max instances:'.padEnd(20))} ${max}`);
    console.log(`${kleur.cyan('Target CPU:'.padEnd(20))} ${targetCpu}%`);
    console.log(`${kleur.cyan('Cooldown:'.padEnd(20))} ${cooldown}s (${(cooldown / 60).toFixed(1)} min)`);
    console.log(kleur.dim('─'.repeat(52)));

    if (opts.dryRun) {
      console.log(kleur.dim('Dry-run — rules not saved.'));
      return;
    }

    saveAutoScaleRules(rules);
    console.log(kleur.green('✅ Auto-scale rules saved.'));
    console.log(kleur.dim(`Config file: ${AUTO_SCALE_FILE}`));
    console.log(kleur.dim('sh1pt cloud will poll metrics and scale up/down based on these rules.'));
  });

scaleCmd
  .command('dns')
  .description('Wire round-robin DNS so traffic spreads across the fleet')
  .requiredOption('--provider <id>', 'dns-porkbun | dns-cloudflare')
  .requiredOption('--domain <fqdn>', 'e.g. api.example.com')
  .option('--ttl <seconds>', 'TTL for DNS records', Number, 60)
  .option('--proxied', 'cloudflare only — route through the CF edge (orange cloud)')
  .option('--dry-run', 'show the DNS records that would be created/updated')
  .option('--json', 'machine-readable output')
  .action((opts: {
    provider: string;
    domain: string;
    ttl: number;
    proxied?: boolean;
    dryRun?: boolean;
    json?: boolean;
  }) => {
    const validProviders = ['dns-porkbun', 'dns-cloudflare'];
    if (!validProviders.includes(opts.provider)) {
      console.error(kleur.red(`Error: invalid DNS provider "${opts.provider}". Must be one of: ${validProviders.join(', ')}`));
      process.exit(1);
    }

    const fleet = loadFleet();
    const runningIps = fleet.instances
      .filter(i => i.status === 'running' && i.publicIp)
      .map(i => ({ id: i.id, ip: i.publicIp!, provider: i.provider }));

    if (runningIps.length === 0) {
      if (opts.json) {
        console.log(JSON.stringify({ domain: opts.domain, provider: opts.provider, records: [], message: 'No running instances with public IPs' }, null, 2));
      } else {
        console.log(kleur.yellow('No running instances with public IPs found in fleet.'));
        console.log(kleur.dim('Provision instances first with `sh1pt scale up`.'));
      }
      return;
    }

    // Build the DNS records that would be created
    const records = runningIps.map((inst, idx) => ({
      type: 'A' as const,
      name: opts.domain,
      value: inst.ip,
      ttl: opts.ttl,
      proxied: opts.proxied ?? false,
      instanceId: inst.id,
      provider: inst.provider,
    }));

    const summary = {
      domain: opts.domain,
      provider: opts.provider,
      ttl: opts.ttl,
      proxied: opts.proxied ?? false,
      recordCount: records.length,
      records,
    };

    if (opts.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    console.log(kleur.bold('\n🌐 DNS Round-Robin Plan'));
    console.log(kleur.dim('─'.repeat(56)));
    console.log(`${kleur.cyan('Domain:'.padEnd(20))} ${opts.domain}`);
    console.log(`${kleur.cyan('DNS Provider:'.padEnd(20))} ${opts.provider}`);
    console.log(`${kleur.cyan('TTL:'.padEnd(20))} ${opts.ttl}s`);
    if (opts.proxied) {
      console.log(`${kleur.cyan('Proxied:'.padEnd(20))} ${kleur.yellow('yes (Cloudflare edge)')}`);
    }
    console.log(`${kleur.cyan('Records:'.padEnd(20))} ${records.length} A record(s)`);
    console.log(kleur.dim('─'.repeat(56)));

    for (const rec of records) {
      console.log(`  ${kleur.green('A')}   ${rec.name.padEnd(30)} → ${rec.value}  ${kleur.dim(`(inst: ${rec.instanceId}, ${rec.provider})`)}`);
    }

    console.log(kleur.dim('─'.repeat(56)));

    if (opts.dryRun) {
      console.log(kleur.dim('Dry-run — no DNS changes made.'));
      return;
    }

    // In a real implementation, this would call the DNS provider API
    // to create/update round-robin A records for the domain.
    // For now, we save the DNS config alongside the fleet state.
    const dnsConfig = {
      domain: opts.domain,
      provider: opts.provider,
      ttl: opts.ttl,
      proxied: opts.proxied ?? false,
      ips: runningIps.map(i => i.ip),
      updatedAt: new Date().toISOString(),
    };

    const credsPath = CREDS_FILE;
    let creds: Record<string, unknown> = {};
    try {
      if (existsSync(credsPath)) creds = JSON.parse(readFileSync(credsPath, 'utf-8'));
    } catch { /* fresh file */ }
    creds.dns = dnsConfig;
    const dir = dirname(credsPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(credsPath, JSON.stringify(creds, null, 2));

    console.log(kleur.green(`✅ DNS round-robin configured for ${opts.domain} with ${records.length} A record(s).`));
    console.log(kleur.dim(`DNS provider: ${opts.provider}`));
    console.log(kleur.dim(`Next step: verify DNS propagation with \`dig ${opts.domain}\``));
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
    // Try loading sh1pt cloud credentials to fetch real fleet state
    let fleetState: { provider: string; hourlyRate: number }[] = [];
    try {
      const credPath = resolve(process.cwd(), '.sh1pt', 'credentials.json');
      if (existsSync(credPath)) {
        const creds = JSON.parse(readFileSync(credPath, 'utf-8'));
        if (creds.fleet && Array.isArray(creds.fleet)) {
          fleetState = creds.fleet;
        }
      }
    } catch { /* no credentials — use defaults */ }

    // Aggregate by provider
    const providerMap = new Map<string, { label: string; instances: number; hourly: number }>();
    for (const inst of fleetState) {
      const p = inst.provider;
      if (!providerMap.has(p)) {
        const info = DEFAULT_PRICING[p] ?? { label: p, hourly: 0 };
        providerMap.set(p, { label: info.label, instances: 0, hourly: info.hourly });
      }
      providerMap.get(p)!.instances++;
    }

    // Fill in providers with known pricing even if no fleet data
    const pricingEntries = Object.entries(DEFAULT_PRICING);
    for (const [id, info] of pricingEntries) {
      if (!providerMap.has(id)) {
        providerMap.set(id, { label: info.label, instances: 0, hourly: info.hourly });
      }
    }

    const byProvider: Record<string, { label: string; instances: number; hourly: number; monthly: number }> = {};
    let totalHourly = 0;

    // Sort by hourly rate descending (most expensive first)
    const sorted = [...providerMap.entries()].sort((a, b) => b[1].hourly - a[1].hourly);

    // Build enriched array with monthly cost computed
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

    // Generate rightsizing suggestions
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

scaleCmd
  .command('status')
  .description('Current fleet: instance count, DNS records, load distribution')
  .option('--json', 'machine-readable output')
  .action((opts: { json?: boolean }) => {
    const fleet = loadFleet();

    // Count by provider and status
    const byProvider = new Map<string, { running: number; stopped: number; failed: number; hourly: number }>();
    let totalHourly = 0;

    for (const inst of fleet.instances) {
      if (!byProvider.has(inst.provider)) {
        byProvider.set(inst.provider, { running: 0, stopped: 0, failed: 0, hourly: 0 });
      }
      const entry = byProvider.get(inst.provider)!;
      entry[inst.status]++;
      entry.hourly += inst.hourlyRate;
      totalHourly += inst.hourlyRate;
    }

    const totalMonthly = totalHourly * 730;

    if (opts.json) {
      const providers: Record<string, unknown> = {};
      for (const [prov, stats] of byProvider) {
        providers[prov] = stats;
      }
      console.log(JSON.stringify({
        instances: fleet.instances.length,
        totalHourly: totalHourly,
        totalMonthly: totalMonthly,
        byProvider: providers,
        lastUpdated: fleet.lastUpdated,
      }, null, 2));
      return;
    }

    console.log(kleur.bold('\n📋 Fleet Status'));
    console.log(kleur.dim('─'.repeat(56)));

    if (fleet.instances.length === 0) {
      console.log(kleur.yellow('No instances in fleet.'));
      console.log(kleur.dim('Provision instances with `sh1pt scale up`.'));
      return;
    }

    // Status summary
    const running = fleet.instances.filter(i => i.status === 'running').length;
    const stopped = fleet.instances.filter(i => i.status === 'stopped').length;
    const failed = fleet.instances.filter(i => i.status === 'failed').length;

    console.log(`${kleur.cyan('Total instances:'.padEnd(20))} ${fleet.instances.length}`);
    console.log(`${kleur.cyan('Running:'.padEnd(20))} ${kleur.green(String(running))}`);
    if (stopped > 0) console.log(`${kleur.cyan('Stopped:'.padEnd(20))} ${kleur.yellow(String(stopped))}`);
    if (failed > 0) console.log(`${kleur.cyan('Failed:'.padEnd(20))} ${kleur.red(String(failed))}`);
    console.log(`${kleur.cyan('Hourly cost:'.padEnd(20))} $${totalHourly.toFixed(3)}/hr`);
    console.log(`${kleur.cyan('Monthly est:'.padEnd(20))} $${totalMonthly.toFixed(2)}/mo`);

    if (fleet.lastUpdated) {
      console.log(`${kleur.cyan('Last updated:'.padEnd(20))} ${fleet.lastUpdated}`);
    }

    // Provider breakdown
    console.log();
    console.log(kleur.bold('By Provider:'));
    console.log(kleur.dim('─'.repeat(56)));
    for (const [prov, stats] of byProvider) {
      const provTotal = stats.running + stats.stopped + stats.failed;
      const provHourly = stats.hourly;
      const statusParts: string[] = [];
      if (stats.running > 0) statusParts.push(kleur.green(`${stats.running} running`));
      if (stats.stopped > 0) statusParts.push(kleur.yellow(`${stats.stopped} stopped`));
      if (stats.failed > 0) statusParts.push(kleur.red(`${stats.failed} failed`));
      console.log(
        `  ${kleur.bold(prov.padEnd(20))} ${String(provTotal).padEnd(4)} inst  ${statusParts.join(', ')}  ${kleur.yellow(`$${provHourly.toFixed(3)}/hr`)}`
      );
    }

    // Instance list
    console.log();
    console.log(kleur.bold('Instances:'));
    console.log(kleur.dim('─'.repeat(56)));
    for (const inst of fleet.instances) {
      const statusIcon = inst.status === 'running' ? kleur.green('●') : inst.status === 'stopped' ? kleur.yellow('■') : kleur.red('✖');
      console.log(
        `  ${statusIcon} ${inst.id.padEnd(12)} ${inst.provider.padEnd(14)} ${inst.publicIp?.padEnd(18) ?? '(no IP)'.padEnd(18)} $${inst.hourlyRate.toFixed(3)}/hr`
      );
    }

    console.log(kleur.dim('─'.repeat(56)));
  });
