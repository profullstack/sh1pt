import { Command } from 'commander';
import kleur from 'kleur';

export const buildCmd = new Command('build')
  .description('Build one or more targets locally or in the sh1pt cloud')
  .option('-t, --target <id...>', 'target ids to build (default: all enabled)')
  .option('-c, --channel <name>', 'release channel', 'stable')
  .option('--cloud', 'run build in sh1pt cloud instead of locally')
  .action((opts: { target?: string[]; channel: string; cloud?: boolean }) => {
    const targets = opts.target?.join(', ') ?? 'all enabled';
    const where = opts.cloud ? 'cloud' : 'local';
    console.log(kleur.cyan(`[stub] build (${where}) · channel=${opts.channel} · targets=${targets}`));
    // TODO: load manifest, resolve targets, invoke Target.build(), stream logs
  });
