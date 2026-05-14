import { Command } from 'commander';
import kleur from 'kleur';
import { describeInput, resolveInput } from '../input.js';
import { deployCmd } from './deploy.js';

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
  .option('--dry-run', 'show what would be provisioned without spending money')
  .action((opts: { instances?: number; provider?: string; maxHourlyPrice?: number; dryRun?: boolean }) => {
    if (opts.dryRun) {
      console.log(kleur.cyan('dry-run: scale up'));
      console.log(`  would provision ${opts.instances ?? 1} instance(s)` +
        (opts.provider ? ` on ${opts.provider}` : ' (same provider as fleet)'));
      if (opts.maxHourlyPrice) console.log(`  max hourly price cap: $${opts.maxHourlyPrice}/hr`);
      console.log(kleur.dim('  no instances will be created'));
      return;
    }
    console.log(kleur.green(`[stub] scale up ${JSON.stringify(opts)}`));
    // TODO: resolve current fleet, call CloudProvider.provision() × N,
    // then DnsProvider.syncRoundRobin() with the new IP list.
  });

scaleCmd
  .command('down')
  .description('Tear down instances (cheapest / least-healthy first)')
  .option('--instances <n>', 'number of instances to destroy', Number)
  .option('--provider <id>', 'cloud provider id')
  .option('--dry-run', 'show which instances would be destroyed without actually destroying them')
  .action((opts: { instances?: number; provider?: string; dryRun?: boolean }) => {
    if (opts.dryRun) {
      console.log(kleur.cyan('dry-run: scale down'));
      console.log(`  would destroy ${opts.instances ?? 1} instance(s)` +
        (opts.provider ? ` on ${opts.provider}` : ''));
      console.log(kleur.dim('  no instances will be destroyed'));
      return;
    }
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
  .option('--dry-run', 'preview the rule that would be saved without persisting it')
  .action((opts: { min: number; max: number; targetCpu: number; cooldown: number; dryRun?: boolean }) => {
    const rule = { min: opts.min, max: opts.max, targetCpu: opts.targetCpu, cooldown: opts.cooldown };
    if (opts.dryRun) {
      console.log(kleur.cyan('dry-run: scale auto — rule preview'));
      console.log(JSON.stringify(rule, null, 2));
      console.log(kleur.dim('  rule will not be persisted'));
      return;
    }
    console.log(kleur.cyan(`[stub] scale auto ${JSON.stringify(rule)}`));
    // TODO: PUT /v1/scale/rules — sh1pt cloud evaluates periodically
  });

scaleCmd
  .command('dns')
  .description('Wire round-robin DNS so traffic spreads across the fleet')
  .requiredOption('--provider <id>', 'dns-porkbun | dns-cloudflare')
  .requiredOption('--domain <fqdn>', 'e.g. api.example.com')
  .option('--ttl <seconds>', '', Number, 60)
  .option('--proxied', 'cloudflare only — route through the CF edge (orange cloud)')
  .option('--dry-run', 'show the DNS records that would be created without modifying DNS')
  .action((opts: { provider: string; domain: string; ttl: number; proxied?: boolean; dryRun?: boolean }) => {
    if (opts.dryRun) {
      console.log(kleur.cyan('dry-run: scale dns'));
      console.log(`  provider: ${opts.provider}`);
      console.log(`  domain:   ${opts.domain}`);
      console.log(`  ttl:      ${opts.ttl}s`);
      if (opts.proxied) console.log('  proxied:  true (cloudflare orange cloud)');
      console.log(kleur.dim('  DNS records will not be modified'));
      return;
    }
    console.log(kleur.cyan(`[stub] scale dns ${JSON.stringify(opts)}`));
    // TODO: resolve fleet IPs, call DnsProvider.syncRoundRobin({ name, ips, ttl, proxied })
  });

scaleCmd
  .command('rollout')
  .description('Stage a new version across the fleet (canary / blue-green)')
  // Use --release instead of --version to avoid shadowing Commander's built-in --version flag.
  .requiredOption('--release <id>', 'the release/version id to roll out')
  .option('--strategy <kind>', 'canary | blue-green | rolling', 'canary')
  .option('--percent <n>', 'canary only — start at N% of traffic', Number, 5)
  .option('--dry-run', 'show the rollout plan without touching the fleet')
  .action((opts: { release: string; strategy: string; percent: number; dryRun?: boolean }) => {
    if (opts.dryRun) {
      console.log(kleur.cyan('dry-run: scale rollout'));
      console.log(`  release:  ${opts.release}`);
      console.log(`  strategy: ${opts.strategy}`);
      if (opts.strategy === 'canary') console.log(`  canary:   ${opts.percent}% of traffic`);
      console.log(kleur.dim('  fleet will not be modified'));
      return;
    }
    console.log(kleur.cyan(`[stub] scale rollout ${JSON.stringify(opts)}`));
    // TODO:
    //   canary    → provision new instances on 'release', adjust DNS weights/round-robin count
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
