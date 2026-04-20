import { Command } from 'commander';
import kleur from 'kleur';
import { describeInput, resolveInput } from '../input.js';
import { entityCmd } from './entity.js';

export const buildCmd = new Command('build')
  .description('Build one or more targets locally or in the sh1pt cloud')
  .option('-t, --target <id...>', 'target ids to build (default: all enabled)')
  .option('-c, --channel <name>', 'release channel', 'stable')
  .option('--cloud', 'run build in sh1pt cloud instead of locally')
  .option('--from <input>', 'existing git repo, live url, local path, or manifest doc to build from')
  .action((opts: { target?: string[]; channel: string; cloud?: boolean; from?: string }) => {
    const targets = opts.target?.join(', ') ?? 'all enabled';
    const where = opts.cloud ? 'cloud' : 'local';
    if (opts.from) {
      const input = resolveInput(opts.from);
      console.log(kleur.cyan(`[stub] build (${where}) · channel=${opts.channel} · from=${describeInput(input)}`));
      // TODO: kind==='git' → clone and detect stack; kind==='path' → load manifest;
      // kind==='doc' → parse manifest; kind==='url' → HEAD/fetch to infer stack.
      return;
    }
    console.log(kleur.cyan(`[stub] build (${where}) · channel=${opts.channel} · targets=${targets}`));
    // TODO: load manifest, resolve targets, invoke Target.build(), stream logs
  });

// Entity-ops lives under `build` — an entity (certificate, bylaws, filing
// packet, checklist) is an artifact the CLI produces, so it fits the build
// verb. See docs/prd/entityctl.md.
buildCmd.addCommand(entityCmd);
