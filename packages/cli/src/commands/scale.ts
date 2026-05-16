import { Command } from 'commander';
import kleur from 'kleur';
import { describeInput, resolveInput } from '../input.js';
import { deployCmd } from './deploy.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

const AUTO_SCALE_FILE = join(homedir(), '.sh1pt', 'auto-scale-rules.json');

interface AutoScaleRule {
  min: number;
  max: number;
  targetCpu: number;
  cooldown: number;
  enabled: boolean;
  updatedAt: string;
}

function loadRules(): AutoScaleRule {
  try {
    if (existsSync(AUTO_SCALE_FILE)) {
      return JSON.parse(readFileSync(AUTO_SCALE_FILE, 'utf-8')) as AutoScaleRule;
    }
  } catch {
    // corrupted — reset
  }
  return { min: 1, max: 10, targetCpu: 70, cooldown: 300, enabled: false, updatedAt: new Date().toISOString() };
}

function saveRules(rules: AutoScaleRule): void {
  const dir = dirname(AUTO_SCALE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  rules.updatedAt = new Date().toISOString();
  writeFileSync(AUTO_SCALE_FILE, JSON.stringify(rules, null, 2));
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
  .option('--enable', 'enable auto-scaling after setting rules')
  .option('--disable', 'disable auto-scaling')
  .option('--show', 'display current auto-scale rules')
  .action((opts: {
    min?: number;
    max?: number;
    targetCpu?: number;
    cooldown?: number;
    enable?: boolean;
    disable?: boolean;
    show?: boolean;
  }) => {
    const current = loadRules();

    if (opts.show) {
      console.log(kleur.bold('\nAuto-Scale Rules'));
      console.log(kleur.dim('─'.repeat(40)));
      console.log(`${kleur.cyan('Enabled:')}       ${current.enabled ? kleur.green('✓ yes') : kleur.red('✗ no')}`);
      console.log(`${kleur.cyan('Min instances:')}  ${current.min}`);
      console.log(`${kleur.cyan('Max instances:')}  ${current.max}`);
      console.log(`${kleur.cyan('Target CPU:')}     ${current.targetCpu}%`);
      console.log(`${kleur.cyan('Cooldown:')}       ${current.cooldown}s`);
      console.log(`${kleur.cyan('Last updated:')}   ${current.updatedAt}`);
      console.log(kleur.dim('─'.repeat(40)));
      console.log(kleur.dim(`Rule file: ${AUTO_SCALE_FILE}`));
      return;
    }

    if (opts.disable) {
      current.enabled = false;
      saveRules(current);
      console.log(kleur.yellow('Auto-scaling disabled.'));
      return;
    }

    // Update values if provided
    if (opts.min !== undefined) current.min = opts.min;
    if (opts.max !== undefined) current.max = opts.max;
    if (opts.targetCpu !== undefined) current.targetCpu = opts.targetCpu;
    if (opts.cooldown !== undefined) current.cooldown = opts.cooldown;
    if (opts.enable) current.enabled = true;

    // Validate
    if (current.min < 1) {
      console.error(kleur.red('Error: --min must be at least 1'));
      process.exit(1);
    }
    if (current.max < current.min) {
      console.error(kleur.red(`Error: --max (${current.max}) must be >= --min (${current.min})`));
      process.exit(1);
    }
    if (current.targetCpu < 1 || current.targetCpu > 100) {
      console.error(kleur.red('Error: --target-cpu must be between 1 and 100'));
      process.exit(1);
    }
    if (current.cooldown < 10) {
      console.error(kleur.red('Error: --cooldown must be at least 10 seconds'));
      process.exit(1);
    }

    saveRules(current);

    console.log(kleur.green('Auto-scale rules saved.'));
    console.log(kleur.dim(`  min:      ${current.min}`));
    console.log(kleur.dim(`  max:      ${current.max}`));
    console.log(kleur.dim(`  target:   ${current.targetCpu}% CPU`));
    console.log(kleur.dim(`  cooldown: ${current.cooldown}s`));
    console.log(kleur.dim(`  enabled:  ${current.enabled ? 'yes' : 'no (use --enable)'}`));
    console.log(kleur.dim(`  file:     ${AUTO_SCALE_FILE}`));
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
    // Provider pricing table (hourly USD, updated 2026-05)
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

    const HOURS_PER_MONTH = 730;
    const fleetFile = join(homedir(), '.sh1pt', 'credentials.json');

    let fleet: Record<string, number> = {};
    try {
      if (existsSync(fleetFile)) {
        const creds = JSON.parse(readFileSync(fleetFile, 'utf-8'));
        fleet = creds.fleet || creds.instances || {};
      }
    } catch { /* no fleet data — show defaults */ }

    // If fleet is empty, show all providers with 0 instances
    const activeProviders = Object.keys(fleet).length > 0
      ? Object.fromEntries(Object.entries(fleet).filter(([, n]) => (n as number) > 0))
      : {};

    const byProvider: Record<string, { instances: number; hourly: number; monthly: number }> = {};
    let totalHourly = 0;
    let totalMonthly = 0;

    for (const [provider, instances] of Object.entries(activeProviders)) {
      const p = PROVIDER_PRICING[provider] || { hourly: 0.05, spot: 0.05 };
      const hourly = p.hourly * (instances as number);
      const monthly = hourly * HOURS_PER_MONTH;
      byProvider[provider] = { instances: instances as number, hourly, monthly };
      totalHourly += hourly;
      totalMonthly += monthly;
    }

    // If no fleet data, show pricing table instead
    if (Object.keys(byProvider).length === 0) {
      if (opts.json) {
        console.log(JSON.stringify({
          hourly: 0,
          monthly: 0,
          byProvider: Object.fromEntries(
            Object.entries(PROVIDER_PRICING).map(([k, v]) => [
              k, { instances: 0, hourly: 0, monthly: 0, rate: v.hourly, spotRate: v.spot }
            ])
          ),
          suggestions: ['No fleet data found. Deploy instances first, or use --json for the pricing reference table.']
        }, null, 2));
        return;
      }
      // Human: show pricing reference
      console.log(kleur.bold('\nCloud Provider Pricing Reference'));
      console.log(kleur.dim('─'.repeat(56)));
      console.log(`${kleur.dim('Provider'.padEnd(16))} ${kleur.dim('Hourly'.padStart(8))} ${kleur.dim('Spot'.padStart(8))} ${kleur.dim('Monthly (730h)'.padStart(14))}`);
      console.log(kleur.dim('─'.repeat(56)));
      for (const [name, p] of Object.entries(PROVIDER_PRICING)) {
        const monthly = p.hourly * HOURS_PER_MONTH;
        const spotMonthly = p.spot * HOURS_PER_MONTH;
        const hasSpot = p.spot < p.hourly;
        console.log(
          `${kleur.cyan(name.padEnd(16))} ` +
          `${`$${p.hourly.toFixed(3)}`.padStart(8)} ` +
          `${hasSpot ? kleur.green(`$${p.spot.toFixed(3)}`.padStart(8)) : kleur.dim('N/A'.padStart(8))} ` +
          `${`$${monthly.toFixed(0)}`.padStart(7)}` +
          `${hasSpot ? kleur.dim(` (spot: $${spotMonthly.toFixed(0)})`) : ''}`
        );
      }
      console.log(kleur.dim('─'.repeat(56)));
      console.log(kleur.dim('No active fleet. Prices are reference only — actual costs vary by SKU, region, and term.'));
      console.log(kleur.dim(`To track fleet costs, add "instances" or "fleet" to ${fleetFile}`));
      return;
    }

    // Rightsizing suggestions
    const suggestions: string[] = [];
    for (const [provider, data] of Object.entries(byProvider)) {
      const p = PROVIDER_PRICING[provider];
      if (p && p.spot < p.hourly && data.hourly > 0.10) {
        const spotSavings = ((p.hourly - p.spot) / p.hourly * 100).toFixed(0);
        suggestions.push(`${provider}: $${data.hourly.toFixed(3)}/hr — consider spot/preemptible instances (save ~${spotSavings}%)`);
      }
    }
    if (suggestions.length === 0 && totalHourly > 0) {
      suggestions.push('Current pricing looks competitive. No rightsizing suggestions at this time.');
    }

    if (opts.json) {
      console.log(JSON.stringify({ hourly: totalHourly, monthly: totalMonthly, byProvider, suggestions }, null, 2));
      return;
    }

    console.log(kleur.bold('\nCost Report'));
    console.log(kleur.dim('─'.repeat(56)));
    console.log(`${kleur.cyan('Total hourly:'.padEnd(20))} $${totalHourly.toFixed(3)}`);
    console.log(`${kleur.cyan('Total monthly:'.padEnd(20))} $${totalMonthly.toFixed(2)}`);
    console.log(kleur.dim('─'.repeat(56)));
    console.log(kleur.bold('Per-provider:'));
    for (const [provider, data] of Object.entries(byProvider)) {
      console.log(`  ${kleur.cyan(provider.padEnd(16))} ${data.instances} instance(s) · $${data.hourly.toFixed(3)}/hr · $${data.monthly.toFixed(0)}/mo`);
    }
    if (suggestions.length > 0) {
      console.log(kleur.dim('─'.repeat(56)));
      console.log(kleur.bold('Suggestions:'));
      suggestions.forEach(s => console.log(`  ${kleur.yellow('→')} ${s}`));
    }
  });

scaleCmd
  .command('status')
  .description('Current fleet: instance count, DNS records, load distribution')
  .option('--json')
  .action((opts: { json?: boolean }) => {
    if (opts.json) {
      console.log(JSON.stringify({ instances: [], dns: [], autoRules: loadRules() }, null, 2));
      return;
    }
    const rules = loadRules();
    console.log(kleur.dim('[stub] scale status'));
    console.log(kleur.dim(`  auto-scaling: ${rules.enabled ? kleur.green('on') : kleur.red('off')}`));
    console.log(kleur.dim(`  rules: min=${rules.min}, max=${rules.max}, target=${rules.targetCpu}%, cooldown=${rules.cooldown}s`));
  });
