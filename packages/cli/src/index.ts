import { Command } from 'commander';
import kleur from 'kleur';
import { buildCmd } from './commands/build.js';
import { shipCmd } from './commands/ship.js';
import { promoteCmd } from './commands/promote.js';
import { loginCmd } from './commands/login.js';
import { secretsCmd } from './commands/secrets.js';

const program = new Command();

program
  .name('sh1pt')
  .description('Ship one codebase to every platform, store, and registry — then promote it everywhere.')
  .version('0.0.0');

// Primary verbs.
program.addCommand(buildCmd);
program.addCommand(shipCmd);
program.addCommand(promoteCmd);

// Cross-cutting utilities.
program.addCommand(loginCmd);
program.addCommand(secretsCmd);

program.parseAsync(process.argv).catch((err) => {
  console.error(kleur.red(`error: ${err.message}`));
  process.exit(1);
});
