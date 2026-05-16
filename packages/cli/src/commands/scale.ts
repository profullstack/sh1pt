import { Command } from 'commander';
import kleur from 'kleur';
import { describeInput, resolveInput } from '../input.js';
import { deployCmd } from './deploy.js';

// Shared dry-run guard used by commands that mutate live infrastructure.
// Prints a [dry-run] plan line and returns true when --dry-run is set so
// callers can short-circuit before performing any real side effects.
function dryRunGuard(label: string, opts: Record<string, unknown>): boolean {
  if (!opts['dryRun']) return false;
  const detail = Object.entries(opts)
    .filter(([k, v]) => k !== 'dryRun' && v !== undefined)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(' ');
  console.log(kleur.yellow(`[dry-run] ${label}${detail ? ' · ' + detail : ''}`));
  return true;
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
  .option('--dry-run', 'validate the plan without provisioning or spending')
  .action((opts: { instances?: number; provider?: string; maxHourlyPrice?: number; dryRun?: boolean }) => {
    if (dryRunGuard('scale up', opts)) return;
    console.log(kleur.green(`[stub] scale up ${JSON.stringify(opts)}`));
    // TODO: resolve current fleet, call CloudProvider.provision() × N,
    // then DnsProvider.syncRoundRobin() with the new IP list.
  });

scaleCmd
  .command('down')
  .description('Tear down instances (cheapest / least-healthy first)')
  .option('--instances <n>', 'number of instances to destroy', Number)
  .option('--provider <id>', 'cloud provider id')
  .option('--dry-run', 'validate the plan without destroying any instances')
  .action((opts: { instances?: number; provider?: string; dryRun?: boolean }) => {
    if (dryRunGuard('scale down', opts)) return;
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
  .option('--dry-run', 'validate the rule without saving it (no cloud write)')
  .action((opts: { min: number; max: number; targetCpu: number; cooldown: number; dryRun?: boolean }) => {
    if (dryRunGuard('scale auto', opts)) return;
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
  .option('--dry-run', 'validate the DNS plan without writing any records')
  .action((opts: { provider: string; domain: string; ttl: number; proxied?: boolean; dryRun?: boolean }) => {
    if (dryRunGuard('scale dns', opts)) return;
    console.log(kleur.cyan(`[stub] scale dns ${JSON.stringify(opts)}`));
    // TODO: resolve fleet IPs, call DnsProvider.syncRoundRobin({ name, ips, ttl, proxied })
  });

scaleCmd
  .command('rollout')
  .description('Stage a new release across the fleet (canary / blue-green / rolling)')
  // Use --release instead of --version to avoid conflict with Commander's built-in -V / --version flag.
  .requiredOption('--release <id>', 'release id to roll out (e.g. v1.4.2)')
  .option('--strategy <kind>', 'canary | blue-green | rolling', 'canary')
  .option('--percent <n>', 'canary only — start at N% of traffic', Number, 5)
  .option('--dry-run', 'validate the rollout plan without shifting any traffic')
  .action((opts: { release: string; strategy: string; percent: number; dryRun?: boolean }) => {
    if (dryRunGuard('scale rollout', opts)) return;
    console.log(kleur.cyan(`[stub] scale rollout ${JSON.stringify(opts)}`));
    // TODO:
    //   canary    → provision new instances on 'release', adjust DNS weights/round-robin count
    //   blue-green → full parallel fleet, cut DNS over atomically, destroy old on success
    //   rolling   → replace instances one at a time with the new release
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
