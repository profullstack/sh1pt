import { Command } from 'commander';
import { writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import kleur from 'kleur';
import prompts from 'prompts';
import { lint } from '@profullstack/sh1pt-policy';
import { loadManifest } from '../manifest.js';

const CONFIG_TEMPLATE = (name: string) => `import { defineConfig } from '@profullstack/sh1pt-core';

export default defineConfig({
  name: '${name}',
  version: '0.0.0',
  targets: {
    // add targets with \`sh1pt ship target add <id>\`
  },
});
`;

function optionWithParents(command: Command): Record<string, unknown> {
  const chain: Command[] = [];
  for (let current: Command | null = command; current; current = current.parent) chain.unshift(current);
  return Object.assign({}, ...chain.map((current) => current.opts()));
}

function manifestTargetSummary(manifest: Awaited<ReturnType<typeof loadManifest>>['manifest'], requested?: string[]) {
  return Object.entries(manifest.targets ?? {})
    .filter(([id, spec]) => spec.enabled !== false && (!requested?.length || requested.includes(id)))
    .map(([id, spec]) => ({
      id,
      use: spec.use,
      distribute: spec.distribute ?? [],
      enabled: spec.enabled !== false,
    }));
}

export const shipCmd = new Command('ship')
  .description('Publish built artifacts to their target stores and registries')
  .option('-t, --target <id...>', 'target ids to ship (default: all enabled)')
  .option('-c, --channel <name>', 'release channel', 'stable')
  .option('--dry-run', 'simulate without uploading')
  .option('--skip-lint', 'skip the pre-ship policy linter (not recommended)')
  .option('--json', 'emit the resolved ship plan as JSON')
  .action(async (opts: { target?: string[]; channel: string; dryRun?: boolean; skipLint?: boolean; json?: boolean }) => {
    const { manifest, path } = await loadManifest();
    if (!manifest.channels.includes(opts.channel)) {
      throw new Error(`Unknown channel "${opts.channel}". Available channels: ${manifest.channels.join(', ')}`);
    }

    const selected = manifestTargetSummary(manifest, opts.target);
    if (opts.target?.length) {
      const known = new Set(selected.map((target) => target.id));
      const missing = opts.target.filter((id) => !known.has(id));
      if (missing.length) throw new Error(`Unknown or disabled target(s): ${missing.join(', ')}`);
    }

    const policyResult = opts.skipLint ? null : await lint({ manifest, projectDir: process.cwd() });
    const plan = {
      command: 'ship',
      project: manifest.name,
      version: manifest.version,
      config: path,
      channel: opts.channel,
      dryRun: opts.dryRun ?? true,
      lint: policyResult ? { errors: policyResult.errors, warnings: policyResult.warnings } : { skipped: true },
      targets: selected,
    };

    if (opts.json) {
      console.log(JSON.stringify(plan, null, 2));
      return;
    }

    const tag = opts.dryRun ? kleur.yellow('[dry-run]') : kleur.green('[plan]');
    console.log(`${tag} ship · ${manifest.name}@${manifest.version} · channel=${opts.channel}`);
    console.log(kleur.dim(`config: ${path}`));
    if (policyResult) {
      console.log(kleur.dim(`policy: ${policyResult.errors} error(s), ${policyResult.warnings} warning(s)`));
      if (policyResult.errors > 0) {
        console.log(kleur.red('Policy errors block live shipping. Re-run sh1pt promote ship lint for details.'));
        process.exit(1);
      }
    }
    if (selected.length === 0) {
      console.log(kleur.yellow('No enabled targets found. Add one with sh1pt promote ship target add <id>.'));
      return;
    }
    for (const target of selected) {
      const fanout = target.distribute.length ? kleur.dim(` → ${target.distribute.join(', ')}`) : '';
      console.log(`  ${kleur.cyan(target.id)} ${kleur.dim(target.use)}${fanout}`);
    }
    console.log(kleur.dim('Target upload/release execution is intentionally gated behind adapter credentials and the next implementation slice.'));
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
  .action(async (_opts: { target?: string; json?: boolean }, cmd: Command) => {
    const opts = optionWithParents(cmd) as { target?: string; json?: boolean };
    const { manifest, path } = await loadManifest();
    const targets = manifestTargetSummary(manifest, opts.target ? [opts.target] : undefined);
    if (opts.target && targets.length === 0) throw new Error(`Unknown or disabled target: ${opts.target}`);
    const status = {
      project: manifest.name,
      version: manifest.version,
      config: path,
      targets: targets.map((target) => ({
        ...target,
        release: 'not-connected',
        note: 'No cloud release record is configured in this local workspace yet.',
      })),
    };
    if (opts.json) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    console.log(kleur.cyan(`ship status · ${manifest.name}@${manifest.version}`));
    console.log(kleur.dim(`config: ${path}`));
    for (const target of status.targets) {
      console.log(`  ${kleur.cyan(target.id)} ${kleur.dim(target.use)} — ${kleur.yellow(target.release)}`);
      console.log(`    ${kleur.dim(target.note)}`);
    }
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
    const { manifest } = await loadManifest();
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
  .option('--json')
  .action(async (_opts: { json?: boolean }, cmd: Command) => {
    const opts = optionWithParents(cmd) as { json?: boolean };
    const { manifest, path } = await loadManifest();
    const targets = manifestTargetSummary(manifest);
    if (opts.json) {
      console.log(JSON.stringify({ project: manifest.name, config: path, targets }, null, 2));
      return;
    }
    console.log(kleur.cyan(`targets · ${manifest.name}`));
    console.log(kleur.dim(`config: ${path}`));
    if (targets.length === 0) {
      console.log(kleur.yellow('No enabled targets found.'));
      return;
    }
    for (const target of targets) {
      const fanout = target.distribute.length ? kleur.dim(` → ${target.distribute.join(', ')}`) : '';
      console.log(`  ${kleur.cyan(target.id)} ${kleur.dim(target.use)}${fanout}`);
    }
  });

const AVAILABLE_TARGETS = [
  { id: 'pkg-npm', use: 'target-pkg-npm', kind: 'package', status: 'implemented' },
  { id: 'web-vercel', use: 'target-web-vercel', kind: 'web', status: 'adapter-required' },
  { id: 'web-netlify', use: 'target-web-netlify', kind: 'web', status: 'adapter-required' },
  { id: 'mobile-android', use: 'target-mobile-android', kind: 'mobile', status: 'adapter-required' },
  { id: 'mobile-ios', use: 'target-mobile-ios', kind: 'mobile', status: 'adapter-required' },
  { id: 'cdn-jsdelivr', use: 'target-cdn-jsdelivr', kind: 'cdn', status: 'implemented' },
  { id: 'firebase', use: 'target-firebase', kind: 'cloud', status: 'implemented' },
  { id: 'deno-land', use: 'target-deno-land', kind: 'package', status: 'implemented' },
] as const;

targetSubCmd
  .command('available')
  .description('List every target adapter available to install')
  .option('--json')
  .action((_opts: { json?: boolean }, cmd: Command) => {
    const opts = optionWithParents(cmd) as { json?: boolean };
    if (opts.json) {
      console.log(JSON.stringify({ targets: AVAILABLE_TARGETS }, null, 2));
      return;
    }
    console.log(kleur.cyan('available target adapters'));
    for (const target of AVAILABLE_TARGETS) {
      const color = target.status === 'implemented' ? kleur.green : kleur.yellow;
      console.log(`  ${kleur.cyan(target.id)} ${kleur.dim(target.use)} ${kleur.dim(target.kind)} ${color(target.status)}`);
    }
  });
