import { Command } from 'commander';
import { writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import kleur from 'kleur';
import prompts from 'prompts';
import { lint } from '@profullstack/sh1pt-policy';
import type { Manifest } from '@profullstack/sh1pt-core';

const CONFIG_TEMPLATE = (name: string) => `import { defineConfig } from '@profullstack/sh1pt-core';

export default defineConfig({
  name: '${name}',
  version: '0.0.0',
  targets: {
    // add targets with \`sh1pt ship target add <id>\`
  },
});
`;

async function loadManifest(): Promise<Manifest> {
  // Stub — real impl dynamic-imports ./sh1pt.config.ts
  return { name: 'stub', version: '0.0.0', channels: ['stable', 'beta', 'canary'], targets: {} };
}

export const shipCmd = new Command('ship')
  .description('Publish built artifacts to their target stores and registries')
  .option('-t, --target <id...>', 'target ids to ship (default: all enabled)')
  .option('-c, --channel <name>', 'release channel', 'stable')
  .option('--dry-run', 'simulate without uploading')
  .option('--skip-lint', 'skip the pre-ship policy linter (not recommended)')
  .action(async (opts: { target?: string[]; channel: string; dryRun?: boolean; skipLint?: boolean }) => {
    const targets = opts.target?.join(', ') ?? 'all enabled';
    const tag = opts.dryRun ? kleur.yellow('[dry-run]') : kleur.green('[live]');
    if (!opts.skipLint) {
      console.log(kleur.dim('running pre-ship policy linter…'));
      // TODO: load manifest, call lint(ctx) — abort on errors unless --skip-lint
    }
    console.log(`${tag} ship · channel=${opts.channel} · targets=${targets}`);
    // TODO: load manifest, resolve latest build, invoke Target.ship(), record release
  });

shipCmd
  .command('init')
  .description('Scaffold sh1pt.config.ts in the current project')
  .action(async () => {
    const cfgPath = join(process.cwd(), 'sh1pt.config.ts');
    try {
      await access(cfgPath);
      console.log(kleur.yellow('sh1pt.config.ts already exists — aborting.'));
      return;
    } catch {
      // expected
    }
    const { name } = await prompts({
      type: 'text',
      name: 'name',
      message: 'Project name',
      initial: process.cwd().split('/').pop() ?? 'my-app',
    });
    if (!name) return;
    await writeFile(cfgPath, CONFIG_TEMPLATE(name), 'utf8');
    console.log(kleur.green(`✓ wrote sh1pt.config.ts`));
    console.log(`  next: ${kleur.cyan('sh1pt ship target add <id>')}`);
  });

shipCmd
  .command('setup')
  .description('Connect store credentials (one OAuth per store where possible, tracked checklists for human-only steps)')
  .option('--store <id...>', 'only set up these stores')
  .option('--poll', 're-check every 30s until all stores connected')
  .action((opts: { store?: string[]; poll?: boolean }) => {
    const stores = opts.store?.join(', ') ?? 'all targets from manifest';
    console.log(kleur.cyan(`[stub] ship setup · stores=${stores}`));
    // TODO: per-target onboard/connect flow with deep links + status polling
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
    // TODO: fetch per-target live state from cloud
  });

shipCmd
  .command('rollback')
  .description('Roll back the latest release on one or more targets')
  .option('-t, --target <id...>')
  .action((opts: { target?: string[] }) => {
    const targets = opts.target?.join(', ') ?? 'all enabled';
    console.log(kleur.yellow(`[stub] ship rollback · targets=${targets}`));
    // TODO: resolve previous release, invoke Target.rollback()
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
    // TODO: stream NDJSON-over-SSE from cloud log store
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
  .action(() => {
    console.log(kleur.dim('[stub] target list — read sh1pt.config.ts'));
  });

targetSubCmd
  .command('available')
  .description('List every target adapter available to install')
  .action(() => {
    console.log(kleur.dim('[stub] target available — fetch from registry'));
  });
