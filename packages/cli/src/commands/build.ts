import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import kleur from 'kleur';
import { describeInput, resolveInput } from '../input.js';
import { loadManifest, resolveTargets } from '../manifest.js';
import { entityCmd } from './entity.js';

function run(argv: string[], env?: Record<string, string>): number {
  console.log(kleur.cyan(`→ ${argv.join(' ')}`));
  const [cmd, ...rest] = argv;
  if (!cmd) throw new Error('empty command');
  const r = spawnSync(cmd, rest, {
    stdio: 'inherit',
    env: env ? { ...process.env, ...env } : process.env,
  });
  return r.status ?? 0;
}

export const buildCmd = new Command('build')
  .description('Build one or more targets locally or in the sh1pt cloud')
  .option('-t, --target <id...>', 'target ids to build (default: all enabled)')
  .option('-c, --channel <name>', 'release channel', 'stable')
  .option('--cloud', 'run build in sh1pt cloud instead of locally')
  .option('--dry-run', 'resolve and validate the build plan without invoking target adapters')
  .option('--json', 'emit the resolved build plan as JSON')
  .option('--from <input>', 'existing git repo, live url, local path, or manifest doc to build from')
  .action(async (opts: { target?: string[]; channel: string; cloud?: boolean; dryRun?: boolean; json?: boolean; from?: string }) => {
    const where = opts.cloud ? 'cloud' : 'local';
    if (opts.from) {
      const input = resolveInput(opts.from);
      const plan = {
        command: 'build',
        mode: where,
        channel: opts.channel,
        from: input,
        dryRun: opts.dryRun ?? true,
      };
      if (opts.json) {
        console.log(JSON.stringify(plan, null, 2));
      } else {
        console.log(kleur.cyan(`${opts.dryRun ? '[dry-run] ' : ''}build (${where}) · channel=${opts.channel} · from=${describeInput(input)}`));
        console.log(kleur.dim('No project manifest was loaded because --from points at an external input.'));
      }
      return;
    }

    const { manifest, path } = await loadManifest();
    if (!manifest.channels.includes(opts.channel)) {
      throw new Error(`Unknown channel "${opts.channel}". Available channels: ${manifest.channels.join(', ')}`);
    }

    const targets = resolveTargets(manifest, opts.target);
    const plan = {
      command: 'build',
      project: manifest.name,
      version: manifest.version,
      config: path,
      mode: where,
      channel: opts.channel,
      dryRun: opts.dryRun ?? true,
      targets: targets.map(({ id, spec }) => ({ id, use: spec.use, distribute: spec.distribute ?? [] })),
    };

    if (opts.json) {
      console.log(JSON.stringify(plan, null, 2));
      return;
    }

    const tag = opts.dryRun ? kleur.yellow('[dry-run]') : kleur.green('[plan]');
    console.log(`${tag} build · ${manifest.name}@${manifest.version} · ${where} · channel=${opts.channel}`);
    console.log(kleur.dim(`config: ${path}`));
    if (targets.length === 0) {
      console.log(kleur.yellow('No enabled targets found. Add one with sh1pt promote ship target add <id>.'));
      return;
    }
    for (const { id, spec } of targets) {
      const fanout = spec.distribute?.length ? kleur.dim(` → ${spec.distribute.join(', ')}`) : '';
      console.log(`  ${kleur.cyan(id)} ${kleur.dim(spec.use)}${fanout}`);
    }
    console.log(kleur.dim('Target adapter execution is intentionally gated behind the next implementation slice.'));
  });

// Entity-ops lives under `build` — an entity (certificate, bylaws, filing
// packet, checklist) is an artifact the CLI produces, so it fits the build
// verb. See docs/prd/entityctl.md.
buildCmd.addCommand(entityCmd);

// Maintainer ops — lockstep version bump for the three published sh1pt
// packages (core / policy / cli). Wraps the root-level `pnpm version:*`
// scripts; only works from inside the sh1pt repo. The matching publish
// flow lives under `sh1pt promote publish npm` (publishing IS promotion).

for (const bump of ['patch', 'minor', 'major'] as const) {
  buildCmd
    .command(`version:${bump}`)
    .description(`Bump ${bump} version of core/policy/cli in lockstep + regenerate pnpm-lock`)
    .action(() => {
      process.exit(run(['pnpm', `version:${bump}`]));
    });
}

// Re-export the `run` helper so promote.ts can shell out without
// duplicating the spawnSync wiring.
export { run as runShell };
