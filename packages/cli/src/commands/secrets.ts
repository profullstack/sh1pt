import { Command } from 'commander';
import kleur from 'kleur';

export const secretsCmd = new Command('secret').description('Manage cloud-vaulted credentials for this project');

secretsCmd
  .command('set <key> [value]')
  .description('Set a secret (value prompted if omitted)')
  .action((key: string, value?: string) => {
    console.log(kleur.cyan(`[stub] secret set ${key}${value ? '=***' : ' (prompt)'}`));
  });

secretsCmd
  .command('get <key>')
  .description('Print a secret (requires interactive confirmation)')
  .action((key: string) => {
    console.log(kleur.yellow(`[stub] secret get ${key}`));
  });

secretsCmd
  .command('list')
  .description('List secret keys (never values)')
  .action(() => {
    console.log(kleur.dim('[stub] secret list'));
  });

secretsCmd
  .command('rm <key>')
  .description('Delete a secret')
  .action((key: string) => {
    console.log(kleur.red(`[stub] secret rm ${key}`));
  });
