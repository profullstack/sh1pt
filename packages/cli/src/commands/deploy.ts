import { Command } from 'commander';
import kleur from 'kleur';

export const deployCmd = new Command('deploy')
  .description('Provision cloud infrastructure — VPS, GPU, bare metal, managed databases, object storage')
  .action(() => {
    deployCmd.help();
  });

deployCmd
  .command('setup')
  .description('Connect cloud provider accounts (RunPod, DigitalOcean, Vultr, Hetzner, Atlantic.Net)')
  .option('--provider <id...>', 'only set up these providers')
  .action((opts: { provider?: string[] }) => {
    const providers = opts.provider?.join(', ') ?? 'all declared in manifest';
    console.log(kleur.cyan(`[stub] deploy setup · providers=${providers}`));
    // TODO: call CloudProvider.connect() per provider, store API keys in secrets vault
  });

deployCmd
  .command('quote')
  .description('Price-check a spec across every connected provider before provisioning')
  .requiredOption('--kind <kind>', 'cpu-vps | gpu | bare-metal | managed-db | block-storage | object-storage')
  .option('--cpu <n>', 'vCPU count', Number)
  .option('--memory <gb>', 'RAM in GB', Number)
  .option('--gpu <model>', 'GPU model, e.g. A100, H100, RTX-4090')
  .option('--gpu-count <n>', 'GPUs per instance', Number)
  .option('--region <id>')
  .option('--spot', 'accept interruptible / spot instances for lower price')
  .action((opts) => {
    console.log(kleur.cyan(`[stub] deploy quote ${JSON.stringify(opts)}`));
    // TODO: fan out CloudProvider.quote() across connected providers, render cheapest-first table
  });

deployCmd
  .command('provision')
  .description('Spin up a new instance (WILL start billing — pair with a --max-hourly-price guardrail)')
  .requiredOption('--provider <id>', 'e.g. cloud-runpod, cloud-digitalocean')
  .requiredOption('--kind <kind>')
  .option('--cpu <n>', Number)
  .option('--memory <gb>', Number)
  .option('--gpu <model>')
  .option('--gpu-count <n>', Number)
  .option('--region <id>')
  .option('--image <name>')
  .option('--spot')
  .option('--max-hourly-price <usd>', 'abort if quote exceeds this (strongly recommended for GPU)', Number)
  .option('--dry-run', 'show the plan without starting a bill')
  .action((opts) => {
    if (opts.kind === 'gpu' && !opts.maxHourlyPrice) {
      console.log(kleur.yellow('⚠ provisioning a GPU without --max-hourly-price. GPU SKUs are $3–8/hr; consider setting a ceiling.'));
    }
    console.log(kleur.green(`[stub] deploy provision ${JSON.stringify(opts)}`));
    // TODO: call CloudProvider.quote(), check maxHourlyPrice, then provision()
  });

deployCmd
  .command('list')
  .description('List all instances sh1pt is tracking across providers')
  .option('--provider <id>')
  .option('--json')
  .action((opts: { provider?: string; json?: boolean }) => {
    if (opts.json) {
      console.log(JSON.stringify({ instances: [] }, null, 2));
      return;
    }
    console.log(kleur.dim(`[stub] deploy list · provider=${opts.provider ?? 'all'}`));
  });

deployCmd
  .command('destroy <instanceId>')
  .description('Tear down an instance (stops billing)')
  .requiredOption('--provider <id>')
  .action((id: string, opts: { provider: string }) => {
    console.log(kleur.red(`[stub] deploy destroy ${id} on ${opts.provider}`));
  });

deployCmd
  .command('status <instanceId>')
  .description('Check instance health + hourly cost')
  .requiredOption('--provider <id>')
  .action((id: string, opts: { provider: string }) => {
    console.log(kleur.dim(`[stub] deploy status ${id} on ${opts.provider}`));
  });
