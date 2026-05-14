import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import kleur from 'kleur';
import { describeInput, resolveInput } from '../input.js';
import { createBuildPlan, formatBuildPlan } from './build-plan.js';
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
  .option('--json', 'print a build plan as JSON when used with --from')
  .action((opts: { target?: string[]; channel: string; cloud?: boolean; from?: string; json?: boolean }) => {
    const targets = opts.target?.join(', ') ?? 'all enabled';
    const where = opts.cloud ? 'cloud' : 'local';
    if (opts.from) {
      const input = resolveInput(opts.from);
      const plan = createBuildPlan(input);
      if (opts.json) {
        console.log(JSON.stringify({ mode: where, channel: opts.channel, plan }, null, 2));
        return;
      }
      console.log(kleur.cyan(`build (${where}) · channel=${opts.channel} · from=${describeInput(input)}`));
      for (const line of formatBuildPlan(plan)) console.log(line);
      return;
    }
    console.log(kleur.cyan(`[stub] build (${where}) · channel=${opts.channel} · targets=${targets}`));
    // TODO: load manifest, resolve targets, invoke Target.build(), stream logs
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
