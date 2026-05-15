import { Command } from 'commander';
import kleur from 'kleur';
import { describeInput, resolveInput } from '../input.js';
import { deployCmd } from './deploy.js';
import { loadScaleState, summarizeScaleCost, summarizeScaleStatus } from './scale-state.js';

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
  .option('--state <path>', 'scale state file to read', '.sh1pt/scale.json')
  .option('--json')
  .action(async (opts: { state?: string; json?: boolean }) => {
    const state = await loadScaleState(opts.state);
    const summary = summarizeScaleCost(state);
    if (opts.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    console.log(kleur.cyan(`scale cost · ${summary.currency}`));
    console.log(`  hourly:  ${summary.hourly.toFixed(2)}`);
    console.log(`  monthly: ${summary.monthly.toFixed(2)} ${kleur.dim('(730h estimate)')}`);
    const providers = Object.entries(summary.byProvider);
    if (providers.length > 0) {
      console.log('\nproviders:');
      for (const [provider, cost] of providers) {
        console.log(`  ${provider}: ${cost.hourly.toFixed(2)}/hr · ${cost.monthly.toFixed(2)}/mo · ${cost.instances} instance(s)`);
      }
    }
    if (summary.suggestions.length > 0) {
      console.log('\nsuggestions:');
      for (const suggestion of summary.suggestions) console.log(`  - ${suggestion}`);
    }
  });

scaleCmd
  .command('status')
  .description('Current fleet: instance count, DNS records, load distribution')
  .option('--state <path>', 'scale state file to read', '.sh1pt/scale.json')
  .option('--json')
  .action(async (opts: { state?: string; json?: boolean }) => {
    const state = await loadScaleState(opts.state);
    const summary = summarizeScaleStatus(state);
    if (opts.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    console.log(kleur.cyan(`scale status · ${summary.instances.length} instance(s)`));
    const statuses = Object.entries(summary.byStatus).map(([status, count]) => `${status}=${count}`).join(' ');
    if (statuses) console.log(`  ${statuses}`);
    if (summary.publicIps.length > 0) console.log(`  public IPs: ${summary.publicIps.join(', ')}`);
    if (summary.dns.length > 0) {
      console.log('\ndns:');
      for (const entry of summary.dns) {
        const provider = entry.provider ? ` · ${entry.provider}` : '';
        const ttl = entry.ttl ? ` · ttl=${entry.ttl}` : '';
        console.log(`  ${entry.domain}${provider}${ttl}`);
        for (const record of entry.records ?? []) {
          const weight = record.weight === undefined ? '' : ` · weight=${record.weight}`;
          console.log(`    ${record.type ?? 'A'} ${record.name} -> ${record.value}${weight}`);
        }
      }
    }
    if (summary.autoRules) {
      console.log(`\nauto: min=${summary.autoRules.min} max=${summary.autoRules.max}` +
        `${summary.autoRules.targetCpu ? ` targetCpu=${summary.autoRules.targetCpu}%` : ''}` +
        `${summary.autoRules.cooldown ? ` cooldown=${summary.autoRules.cooldown}s` : ''}`);
    }
  });
