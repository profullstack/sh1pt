import { Command } from 'commander';
import kleur from 'kleur';
import { buildCmd } from './commands/build.js';
import { promoteCmd } from './commands/promote.js';
import { scaleCmd } from './commands/scale.js';
import { iterateCmd } from './commands/iterate.js';
import { loginCmd } from './commands/login.js';
import { secretsCmd } from './commands/secrets.js';
import { configCmd } from './commands/config.js';
import { entityCmd } from './commands/entity.js';

const program = new Command();

program
  .name('sh1pt')
  .description('Build. Promote. Scale. Iterate…')
  .version('0.0.0');

// Four primary verbs — one per word of the tagline. Everything else is a
// subcommand so the global namespace stays clean.
program.addCommand(buildCmd);      // build    · compile
program.addCommand(promoteCmd);    // promote  · publish (ship), ads, merch — anything that gets users
program.addCommand(scaleCmd);      // scale    · provision (deploy), DNS, rollouts, cost
program.addCommand(iterateCmd);    // iterate  · observe + agent-propose + ship + measure (agents nested)

// Auth + config utilities — cross-cutting, kept top-level for convention.
program.addCommand(loginCmd);
program.addCommand(secretsCmd);
program.addCommand(configCmd);
program.addCommand(entityCmd);     // entity   · formation + compliance + spinouts (jurisdiction packs)

program.parseAsync(process.argv).catch((err) => {
  console.error(kleur.red(`error: ${err.message}`));
  process.exit(1);
});
