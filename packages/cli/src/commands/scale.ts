import { Command } from 'commander';
import kleur from 'kleur';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describeInput, resolveInput } from '../input.js';
import { deployCmd } from './deploy.js';

// Known provider pricing references — sourced from each adapter's
// inline doc when real-time quote() isn't available (no API key).
// Values are approximate USD/hour for the cheapest comparable SKU.
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
  .option('--json')
  .action((opts: { json?: boolean }) => {
    if (opts.json) {
      console.log(JSON.stringify({ instances: [], dns: [], autoRules: null }, null, 2));
      return;
    }
    console.log(kleur.dim('[stub] scale status'));
  });
