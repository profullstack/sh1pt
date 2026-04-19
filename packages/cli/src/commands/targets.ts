import { Command } from 'commander';
import kleur from 'kleur';

export const targetsCmd = new Command('target').description('Manage targets in this project');

targetsCmd
  .command('add <id>')
  .description('Add a target adapter to the manifest')
  .action((id: string) => {
    console.log(kleur.cyan(`[stub] target add ${id} — prompt for config and patch sh1pt.config.ts`));
  });

targetsCmd
  .command('remove <id>')
  .description('Remove a target from the manifest')
  .action((id: string) => {
    console.log(kleur.yellow(`[stub] target remove ${id}`));
  });

targetsCmd
  .command('list')
  .description('List enabled targets for the current project')
  .action(() => {
    console.log(kleur.dim('[stub] target list — read sh1pt.config.ts'));
  });

targetsCmd
  .command('available')
  .description('List every target adapter available to install')
  .action(() => {
    console.log(kleur.dim('[stub] target available — fetch from registry'));
  });
