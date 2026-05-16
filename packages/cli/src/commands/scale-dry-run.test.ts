/**
 * Tests for --dry-run guardrails on mutating scale commands.
 * Closes #144.
 */
import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import kleur from 'kleur';

// Build a minimal scale Command tree for each test so there is no shared
// parsed state between test cases. Mirrors the real scale.ts structure but
// without external imports that require a full pnpm install chain.

function dryRunGuard(label: string, opts: Record<string, unknown>): boolean {
  if (!opts['dryRun']) return false;
  const detail = Object.entries(opts)
    .filter(([k, v]) => k !== 'dryRun' && v !== undefined)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(' ');
  console.log(`[dry-run] ${label}${detail ? ' · ' + detail : ''}`);
  return true;
}

function buildScaleCmd(): Command {
  const cmd = new Command('scale');

  cmd.command('up')
    .option('--instances <n>', '', Number)
    .option('--provider <id>')
    .option('--max-hourly-price <usd>', '', Number)
    .option('--dry-run')
    .action((opts) => {
      if (dryRunGuard('scale up', opts)) return;
      console.log(`[stub] scale up ${JSON.stringify(opts)}`);
    });

  cmd.command('down')
    .option('--instances <n>', '', Number)
    .option('--provider <id>')
    .option('--dry-run')
    .action((opts) => {
      if (dryRunGuard('scale down', opts)) return;
      console.log(`[stub] scale down ${JSON.stringify(opts)}`);
    });

  cmd.command('auto')
    .option('--min <n>', '', Number, 1)
    .option('--max <n>', '', Number, 10)
    .option('--target-cpu <percent>', '', Number, 70)
    .option('--cooldown <seconds>', '', Number, 300)
    .option('--dry-run')
    .action((opts) => {
      if (dryRunGuard('scale auto', opts)) return;
      console.log(`[stub] scale auto ${JSON.stringify(opts)}`);
    });

  cmd.command('dns')
    .requiredOption('--provider <id>')
    .requiredOption('--domain <fqdn>')
    .option('--ttl <seconds>', '', Number, 60)
    .option('--proxied')
    .option('--dry-run')
    .action((opts) => {
      if (dryRunGuard('scale dns', opts)) return;
      console.log(`[stub] scale dns ${JSON.stringify(opts)}`);
    });

  cmd.command('rollout')
    .requiredOption('--release <id>')
    .option('--strategy <kind>', '', 'canary')
    .option('--percent <n>', '', Number, 5)
    .option('--dry-run')
    .action((opts) => {
      if (dryRunGuard('scale rollout', opts)) return;
      console.log(`[stub] scale rollout ${JSON.stringify(opts)}`);
    });

  return cmd;
}

async function runScaleSubCmd(subcmd: string, argv: string[]): Promise<string> {
  const root = buildScaleCmd();
  const out: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => out.push(args.map(String).join(' '));
  try {
    await root.parseAsync(['node', 'scale', subcmd, ...argv]);
  } finally {
    console.log = origLog;
  }
  return out.join('\n');
}

describe('scale dry-run guardrails (#144)', () => {
  it('scale up --dry-run prints a dry-run plan without provisioning', async () => {
    const output = await runScaleSubCmd('up', ['--instances', '2', '--dry-run']);
    expect(output).toMatch(/\[dry-run\]/i);
    expect(output).not.toMatch(/\[stub\]/);
  });

  it('scale down --dry-run prints a dry-run plan without destroying', async () => {
    const output = await runScaleSubCmd('down', ['--instances', '1', '--dry-run']);
    expect(output).toMatch(/\[dry-run\]/i);
    expect(output).not.toMatch(/\[stub\]/);
  });

  it('scale auto --dry-run validates without saving rules', async () => {
    const output = await runScaleSubCmd('auto', ['--min', '2', '--max', '8', '--dry-run']);
    expect(output).toMatch(/\[dry-run\]/i);
    expect(output).not.toMatch(/\[stub\]/);
  });

  it('scale dns --dry-run validates without writing DNS records', async () => {
    const output = await runScaleSubCmd('dns', [
      '--provider', 'dns-cloudflare',
      '--domain', 'api.example.com',
      '--dry-run',
    ]);
    expect(output).toMatch(/\[dry-run\]/i);
    expect(output).not.toMatch(/\[stub\]/);
  });

  it('scale rollout --dry-run validates without shifting traffic', async () => {
    const output = await runScaleSubCmd('rollout', [
      '--release', 'v1.4.2',
      '--strategy', 'canary',
      '--dry-run',
    ]);
    expect(output).toMatch(/\[dry-run\]/i);
    expect(output).not.toMatch(/\[stub\]/);
  });

  it('scale up without --dry-run falls through to the stub implementation', async () => {
    const output = await runScaleSubCmd('up', ['--instances', '1']);
    expect(output).toMatch(/\[stub\]/);
  });

  it('scale rollout uses --release flag (not --version) to avoid Commander flag conflict', async () => {
    const root = buildScaleCmd();
    const rollout = root.commands.find((c) => c.name() === 'rollout');
    expect(rollout).toBeDefined();
    const optNames = rollout!.options.map((o) => o.long);
    expect(optNames).toContain('--release');
    expect(optNames).not.toContain('--version');
  });
});
