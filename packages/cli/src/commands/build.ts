import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import kleur from 'kleur';
import { describeInput, resolveInput } from '../input.js';
import { buildProject } from '../build-project.js';
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
  .option('--from <input>', 'existing git repo, live url, local path, or manifest doc to build from')
  .option('--dry-run', 'validate and render side-effect-free build outputs when supported')
  .action(async (opts: { target?: string[]; channel: string; cloud?: boolean; from?: string; dryRun?: boolean }) => {
    if (opts.cloud) {
      const targets = opts.target?.join(', ') ?? 'all enabled';
      console.log(kleur.cyan(`[stub] build (cloud) · channel=${opts.channel} · targets=${targets}`));
      return;
    }

    const input = resolveInput(opts.from ?? process.cwd());
    if (input.kind !== 'path') {
      console.log(kleur.yellow(`build --from currently runs local project paths; got ${describeInput(input)}`));
      return;
    }
    if (input.exists === false) {
      console.error(kleur.red(`project path does not exist: ${input.value}`));
      process.exit(1);
    }

    const results = await buildProject({
      projectDir: input.value,
      channel: opts.channel,
      targets: opts.target,
      dryRun: opts.dryRun,
      log: (message, level = 'info') => {
        const prefix = level === 'error' ? kleur.red('error') : level === 'warn' ? kleur.yellow('warn') : kleur.dim('info');
        console.log(`${prefix} ${message}`);
      },
    });

    if (results.length === 0) {
      console.log(kleur.dim('No enabled targets to build.'));
      return;
    }

    console.log(kleur.green(`Built ${results.length} target${results.length === 1 ? '' : 's'} from ${describeInput(input)}`));
    for (const result of results) {
      console.log(`  ${kleur.cyan(result.targetId)} (${result.adapterId}) → ${result.artifact}`);
    }
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
