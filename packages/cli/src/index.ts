import { Command } from 'commander';
import kleur from 'kleur';
import { buildCmd } from './commands/build.js';
import { promoteCmd } from './commands/promote.js';
import { scaleCmd } from './commands/scale.js';
import { iterateCmd } from './commands/iterate.js';
import { loginCmd } from './commands/login.js';
import { secretsCmd } from './commands/secrets.js';
import { configCmd } from './commands/config.js';
import { makeCategoryCmd } from './commands/adapter-cmd.js';
import { CATEGORIES } from './adapter-registry.js';

const program = new Command();

program
  .name('sh1pt')
  .description('Build. Promote. Scale. Iterate…')
  .version('0.1.0');

// Four primary verbs — one per word of the tagline. Each accepts --from
// <git|url|path|doc> to jump into the workflow against an existing asset.
// Entity-ops lives under `build` (see docs/prd/entityctl.md).
program.addCommand(buildCmd);      // build    · compile · entity-ops nested
program.addCommand(promoteCmd);    // promote  · publish (ship), ads, merch — anything that gets users
program.addCommand(scaleCmd);      // scale    · provision (deploy), DNS, rollouts, cost
program.addCommand(iterateCmd);    // iterate  · observe + agent-propose + ship + measure (agents nested)

// Auth + config utilities — cross-cutting, kept top-level for convention.
program.addCommand(loginCmd);
program.addCommand(secretsCmd);
program.addCommand(configCmd);

// Filesystem-mirrored adapter commands. One top-level command per
// packages/<category>/ directory → `sh1pt <category> <name> setup`.
for (const cat of CATEGORIES) {
  program.addCommand(makeCategoryCmd(cat));
}

program.parseAsync(process.argv).catch((err) => {
  console.error(kleur.red(`error: ${err.message}`));
  process.exit(1);
});
