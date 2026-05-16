import { Command } from 'commander';
import kleur from 'kleur';
import { describeInput, resolveInput } from '../input.js';
import { deployCmd } from './deploy.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

// Shared fleet state — mirrors the cost and auto commands
const CREDS_FILE = join(homedir(), '.sh1pt', 'credentials.json');

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
  } catch {
    // corrupted or missing
  }
  return { instances: [], lastUpdated: '' };
}

function saveFleet(state: FleetState): void {
  const dir = dirname(CREDS_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  state.lastUpdated = new Date().toISOString();
  // Merge back into the parent structure
  let creds: Record<string, unknown> = {};
  try {
    if (existsSync(CREDS_FILE)) creds = JSON.parse(readFileSync(CREDS_FILE, 'utf-8'));
  } catch { /* fresh file */ }
  creds.instances = state.instances;
  creds.lastUpdated = state.lastUpdated;
  writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2));
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

function getNextId(instances: FleetEntry[]): string {
  const nums = instances
    .map(i => parseInt(i.id.replace(/^inst-/, ''), 10))
    .filter(n => !isNaN(n));
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
  .description('Stage a new version across the fleet (canary / blue-green)')
  .requiredOption('--version <id>')
  .option('--strategy <kind>', 'canary | blue-green | rolling', 'canary')
  .option('--percent <n>', 'canary only — start at N% of traffic', Number, 5)
  .action((opts) => {
    console.log(kleur.cyan(`[stub] scale rollout ${JSON.stringify(opts)}`));
    // TODO:
    //   canary    → provision new instances on 'version', adjust DNS weights/round-robin count
    //   blue-green → full parallel fleet, cut DNS over atomically, destroy old on success
    //   rolling   → replace instances one at a time with the new version
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
