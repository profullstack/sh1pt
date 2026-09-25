import { Command, InvalidArgumentError } from 'commander';
import { readFile } from 'node:fs/promises';
import kleur from 'kleur';
import {
  ENGINES,
  PHASES,
  PLATFORMS,
  type Phase,
  type Platform,
  type Resource,
  type ResourceKind,
  applyPlan,
  availableBinaries,
  compatibleKinds,
  createExec,
  openStaging,
  parseRewrite,
  planMigration,
  platformById,
  recordingExec,
  renderPlan,
  requiredBinaries,
} from '@profullstack/sh1pt-migrate';

/**
 * `sh1pt migrate` — move an app and its data from one platform to another.
 *
 * The commands map onto the only workflow that is safe: look at what is
 * there, read a plan, rehearse it, then run it.
 *
 *   sh1pt migrate platforms                 what can be moved where
 *   sh1pt migrate inventory --from supabase what is on the source
 *   sh1pt migrate plan --from a --to b      the ordered plan, no mutations
 *   sh1pt migrate apply --until freeze      the bulk copy, no downtime
 *   sh1pt migrate apply                     the whole thing
 *
 * `plan` never mutates and never needs to be trusted, which is what makes it
 * safe to point at production. `apply` refuses a plan with blockers.
 */

interface MigrateConfig {
  from?: { platform: string; [k: string]: unknown };
  to?: { platform: string; [k: string]: unknown };
  rewriteHosts?: string[];
  only?: ResourceKind[];
  exclude?: ResourceKind[];
}

function parsePhase(value: string): Phase {
  if (!(PHASES as readonly string[]).includes(value)) {
    throw new InvalidArgumentError(`must be one of: ${PHASES.join(', ')}`);
  }
  return value as Phase;
}

function parseKinds(value: string, previous: ResourceKind[] = []): ResourceKind[] {
  return [...previous, value as ResourceKind];
}

async function loadConfig(path: string | undefined): Promise<MigrateConfig> {
  if (!path) return {};
  const text = await readFile(path, 'utf8');
  return JSON.parse(text) as MigrateConfig;
}

function ctxFor(dryRun: boolean, verbose: boolean) {
  return {
    secret: (key: string) => process.env[key],
    log: (msg: string, level: 'info' | 'warn' | 'error' = 'info') => {
      if (!verbose && level === 'info') return;
      const paint = level === 'error' ? kleur.red : level === 'warn' ? kleur.yellow : kleur.dim;
      console.log(paint(msg));
    },
    dryRun,
  };
}

/** Resolve a platform by id, failing with the list rather than a bare error. */
function resolvePlatform(id: string | undefined, role: 'source' | 'target'): Platform<unknown> {
  if (!id) throw new Error(`--${role === 'source' ? 'from' : 'to'} is required`);
  const platform = platformById(id);
  if (!platform) {
    throw new Error(`unknown platform '${id}'. Known: ${PLATFORMS.map((p) => p.id).join(', ')}`);
  }
  if (role === 'target' && platform.role === 'source') {
    throw new Error(`${platform.label} cannot be a target`);
  }
  return platform as Platform<unknown>;
}

export const migrateCmd = new Command('migrate')
  .description('Move an app and its data between platforms — cloud to dedicated, or back')
  .action(() => {
    migrateCmd.help();
  });

migrateCmd
  .command('platforms')
  .description('List every platform, what it holds, and which pairs can move what')
  .option('--from <id>', 'show only what can move out of this platform')
  .action((opts: { from?: string }) => {
    if (opts.from) {
      const from = platformById(opts.from);
      if (!from) throw new Error(`unknown platform '${opts.from}'`);
      console.log(kleur.bold(`from ${from.label}:`));
      for (const to of PLATFORMS) {
        if (to.id === from.id || to.role === 'source') continue;
        const kinds = compatibleKinds(from.id, to.id);
        const line = `  → ${to.label.padEnd(26)} ${kinds.length ? kinds.join(', ') : kleur.dim('nothing in common')}`;
        console.log(kinds.length ? line : kleur.dim(line));
      }
      return;
    }
    for (const p of PLATFORMS) {
      const role = p.role === 'both' ? 'source+target' : p.role;
      console.log(`${p.id.padEnd(14)} ${role.padEnd(14)} ${p.supports.join(', ')}`);
    }
  });

migrateCmd
  .command('inventory')
  .description('List what is on a platform. Read-only, safe against production')
  .requiredOption('--from <id>', 'platform id')
  .option('-c, --config <path>', 'JSON config with the platform connection details')
  .option('--json')
  .option('-v, --verbose')
  .action(async (opts: { from: string; config?: string; json?: boolean; verbose?: boolean }) => {
    const config = await loadConfig(opts.config);
    const platform = resolvePlatform(opts.from, 'source');
    const inventory = await platform.inventory(ctxFor(true, opts.verbose ?? false), config.from ?? {});

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            platform: inventory.platform,
            scope: inventory.scope,
            // describe(), never reveal(): this output is routinely pasted.
            resources: inventory.resources.map((r) => ({
              kind: r.kind,
              id: r.id,
              name: r.name,
              sizeBytes: r.sizeBytes,
              quirks: r.quirks,
              connection: Object.fromEntries(
                Object.entries(r.connection).map(([k, v]) => [k, v.describe()]),
              ),
            })),
            notes: inventory.notes,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(kleur.bold(`${inventory.platform} · ${inventory.scope}`));
    for (const r of inventory.resources) {
      console.log(`  ${r.kind.padEnd(16)} ${r.name}`);
      for (const q of r.quirks ?? []) console.log(kleur.yellow(`      ! ${q}`));
    }
    for (const n of inventory.notes ?? []) console.log(kleur.dim(`  note: ${n}`));
  });

migrateCmd
  .command('plan')
  .description('Work out what would happen. Touches nothing')
  .requiredOption('--from <id>')
  .requiredOption('--to <id>')
  .option('-c, --config <path>')
  .option('--only <kind>', 'only this resource kind (repeatable)', parseKinds)
  .option('--exclude <kind>', 'skip this resource kind (repeatable)', parseKinds)
  .option('--rewrite-host <old=new>', 'rewrite absolute URLs (repeatable)', (v, p: string[] = []) => [...p, v])
  .option('--json')
  .option('-v, --verbose')
  .action(async (opts) => {
    const plan = await buildPlan(opts);
    console.log(opts.json ? JSON.stringify(plan, null, 2) : renderPlan(plan));
    if (!plan.ok) process.exitCode = 1;
  });

migrateCmd
  .command('apply')
  .description('Run the plan. Refuses one with blockers')
  .requiredOption('--from <id>')
  .requiredOption('--to <id>')
  .option('-c, --config <path>')
  .option('--only <kind>', 'only this resource kind (repeatable)', parseKinds)
  .option('--exclude <kind>', 'skip this resource kind (repeatable)', parseKinds)
  .option('--rewrite-host <old=new>', 'rewrite absolute URLs (repeatable)', (v, p: string[] = []) => [...p, v])
  .option('--staging <dir>', 'where dumps are kept between export and import', '.sh1pt-migrate')
  .option(
    '--until <phase>',
    `stop before this phase (${PHASES.join(', ')}). --until freeze rehearses without downtime`,
    parsePhase,
  )
  .option('--dry-run', 'print what would run without running it')
  .option('-v, --verbose')
  .action(async (opts) => {
    const plan = await buildPlan(opts);
    if (!plan.ok) {
      console.log(renderPlan(plan));
      throw new Error('plan has blockers; fix them or exclude the resources involved');
    }

    const config = await loadConfig(opts.config);
    const source = resolvePlatform(opts.from, 'source');
    const targetPlatform = resolvePlatform(opts.to, 'target');
    const pctx = ctxFor(Boolean(opts.dryRun), opts.verbose ?? false);

    const inventory = await source.inventory(pctx, config.from ?? {});
    const from = new Map(inventory.resources.map((r) => [r.id, r]));

    const to = new Map<string, Resource>();
    for (const r of plan.moving) {
      if (!targetPlatform.provision) break;
      to.set(r.id, await targetPlatform.provision(pctx, r, config.to ?? {}));
    }

    const { exec } = opts.dryRun ? recordingExec() : { exec: createExec({ log: pctx.log }) };
    const staging = await openStaging({ dir: opts.staging });

    console.log(renderPlan(plan));
    console.log('');

    const result = await applyPlan({
      plan,
      from,
      to,
      engines: new Map(ENGINES),
      ctx: { log: pctx.log, dryRun: Boolean(opts.dryRun), staging, exec },
      ...(opts.until ? { until: opts.until } : {}),
      onStep: (step, outcome) => {
        const mark =
          outcome.status === 'done' ? kleur.green('✓') : outcome.status === 'skipped' ? kleur.dim('·') : kleur.red('✗');
        console.log(`${mark} ${step.title}${outcome.reason ? kleur.dim(` (${outcome.reason})`) : ''}`);
      },
    });

    if (!result.ok) {
      throw new Error(`stopped at '${result.failed?.id}': ${result.failed?.error.message}`);
    }
    console.log(
      kleur.green(
        result.stoppedBefore
          ? `\nStopped before '${result.stoppedBefore}' as asked. Nothing is down.`
          : '\nMigration complete. Leave the source in place until you have watched the target for a day.',
      ),
    );
  });

interface PlanOpts {
  from: string;
  to: string;
  config?: string;
  only?: ResourceKind[];
  exclude?: ResourceKind[];
  rewriteHost?: string[];
  verbose?: boolean;
}

async function buildPlan(opts: PlanOpts) {
  const config = await loadConfig(opts.config);
  const source = resolvePlatform(opts.from, 'source');
  const target = resolvePlatform(opts.to, 'target');

  // Validate every rewrite before touching the network, so a typo costs
  // nothing rather than being discovered after the dump.
  const rewrites = (opts.rewriteHost ?? config.rewriteHosts ?? []).map(parseRewrite);

  const pctx = ctxFor(true, opts.verbose ?? false);
  const inventory = await source.inventory(pctx, config.from ?? {});

  const kinds = [...new Set(inventory.resources.map((r) => r.kind))];
  const binaries = await availableBinaries(requiredBinaries(kinds));

  return planMigration(inventory, target, {
    engines: new Map(ENGINES),
    availableBinaries: binaries,
    ...(opts.only ?? config.only ? { only: opts.only ?? config.only } : {}),
    ...(opts.exclude ?? config.exclude ? { exclude: opts.exclude ?? config.exclude } : {}),
    rewriteHosts: rewrites.map((r) => r.from),
  });
}
