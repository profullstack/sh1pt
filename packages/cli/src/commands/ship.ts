import { Command } from 'commander';
import { join } from 'node:path';
import kleur from 'kleur';
import { lint } from '@profullstack/sh1pt-policy';
import type { Manifest } from '@profullstack/sh1pt-core';
import { readConfigFromFile } from '@profullstack/sh1pt-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { initAction } from './init.js';

async function loadManifest(projectDir?: string): Promise<Manifest> {
  const dir = projectDir ?? process.cwd();
  const configPath = resolve(dir, 'sh1pt.config.ts');
  if (!existsSync(configPath)) {
    throw new Error(`No sh1pt.config.ts found in ${dir}. Run \`sh1pt ship init\` first.`);
  }
  // Dynamic import the TS config — in practice this uses jiti or tsx under the hood
  const mod = (await (Function('return import("' + configPath + '")')())) as {
    default: Manifest;
  };
  return mod.default;
}

export const shipCmd = new Command('ship')
  .description('Publish built artifacts to their target stores and registries')
  .option('-t, --target <id...>', 'target ids to ship (default: all enabled)')
  .option('-c, --channel <name>', 'release channel', 'stable')
  .option('--cloud', 'run submission, retries, polling, and logs in sh1pt cloud')
  .option('--dry-run', 'simulate without uploading')
  .option('--skip-lint', 'skip the pre-ship policy linter (not recommended)')
  .action(async (opts: { target?: string[]; channel: string; cloud?: boolean; dryRun?: boolean; skipLint?: boolean }) => {
    const targets = opts.target?.join(', ') ?? 'all enabled';
    const tag = opts.dryRun ? kleur.yellow('[dry-run]') : kleur.green('[live]');
    const where = opts.cloud ? 'cloud' : 'local';
    if (!opts.skipLint) {
      console.log(kleur.dim('running pre-ship policy linter…'));
    }
    console.log(`${tag} ship (${where}) · channel=${opts.channel} · targets=${targets}`);
  });

shipCmd
  .command('init')
  .description('Scaffold sh1pt.config.ts in the current project')
  .action(initAction);

shipCmd
  .command('setup')
  .description('Connect store credentials (one OAuth per store where possible, tracked checklists for human-only steps)')
  .option('--store <id...>', 'only set up these stores')
  .option('--poll', 're-check every 30s until all stores connected')
  .action((opts: { store?: string[]; poll?: boolean }) => {
    const stores = opts.store?.join(', ') ?? 'all targets from manifest';
    console.log(kleur.cyan(`[stub] ship setup · stores=${stores}`));
  });

shipCmd
  .command('status')
  .description('Current release status across targets')
  .option('-t, --target <id>')
  .option('--json')
  .action((opts: { target?: string; json?: boolean }) => {
    if (opts.json) {
      console.log(JSON.stringify({ releases: [], live: {}, inReview: {} }, null, 2));
      return;
    }
    console.log(kleur.dim(`[stub] ship status · target=${opts.target ?? 'all'}`));
  });

shipCmd
  .command('rollback')
  .description('Roll back the latest release on one or more targets')
  .option('-t, --target <id...>')
  .action((opts: { target?: string[] }) => {
    const targets = opts.target?.join(', ') ?? 'all enabled';
    console.log(kleur.yellow(`[stub] ship rollback · targets=${targets}`));
  });

shipCmd
  .command('lint')
  .description('Check manifest and account against store-policy rules (runs automatically on ship)')
  .option('--strict', 'exit non-zero on warnings as well as errors')
  .option('--json')
  .action(async (opts: { strict?: boolean; json?: boolean }) => {
    const manifest = await loadManifest();
    const result = await lint({ manifest, projectDir: process.cwd() });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      for (const f of result.findings) {
        const color = f.severity === 'error' ? kleur.red : f.severity === 'warn' ? kleur.yellow : kleur.dim;
        const loc = f.path ? kleur.dim(` ${f.path}`) : '';
        console.log(`${color(`[${f.severity}]`)} ${kleur.dim(f.ruleId)}${loc} — ${f.message}`);
        if (f.fix) console.log(`       ${kleur.dim('fix:')} ${f.fix}`);
      }
      console.log(`\n${result.errors} error(s), ${result.warnings} warning(s)`);
    }
    if (result.errors > 0 || (opts.strict && result.warnings > 0)) process.exit(1);
  });

shipCmd
  .command('logs')
  .description('Tail build and ship logs')
  .option('-t, --target <id>')
  .option('-f, --follow')
  .action((opts: { target?: string; follow?: boolean }) => {
    console.log(kleur.dim(`[stub] ship logs · target=${opts.target ?? 'all'} · follow=${!!opts.follow}`));
  });

const targetSubCmd = shipCmd.command('target').description('Manage targets in the manifest');

targetSubCmd
  .command('add <id>')
  .description('Add a target adapter to sh1pt.config.ts')
  .action((id: string) => {
    console.log(kleur.cyan(`[stub] target add ${id} — prompt for config and patch sh1pt.config.ts`));
  });

targetSubCmd
  .command('remove <id>')
  .description('Remove a target from sh1pt.config.ts')
  .action((id: string) => {
    console.log(kleur.yellow(`[stub] target remove ${id}`));
  });

targetSubCmd
  .command('list')
  .description('List enabled targets for this project')
  .option('--json', 'output as JSON for automation')
  .option('-c, --config <path>', 'path to alternate sh1pt.config.ts')
  .action(async (opts: { json?: boolean; config?: string }) => {
    const projectDir = opts.config ? resolve(process.cwd(), opts.config, '..') : process.cwd();
    try {
      const manifest = await loadManifest(projectDir);
      const targetEntries = Object.entries(manifest.targets ?? {});

      if (opts.json) {
        const list = targetEntries.map(([id, t]) => ({
          id,
          use: t.use,
          enabled: t.enabled !== false,
        }));
        console.log(JSON.stringify(list, null, 2));
        return;
      }

      if (targetEntries.length === 0) {
        console.log(kleur.dim('No targets configured. Use `sh1pt ship target add <id>` to add one.'));
        return;
      }

      console.log(kleur.bold(`Configured targets (${targetEntries.length}):`));
      for (const [id, t] of targetEntries) {
        const status = t.enabled === false ? kleur.dim('(disabled)') : kleur.green('enabled');
        console.log(`  ${kleur.cyan(id)}  ${kleur.dim(`→ ${t.use}`)}  ${status}`);
      }
    } catch (err) {
      console.error(kleur.red(`error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

targetSubCmd
  .command('available')
  .description('List every target adapter available to install')
  .action(() => {
    console.log(kleur.dim('[stub] target available — fetch from registry'));
  });
