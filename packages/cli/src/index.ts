import { Command } from 'commander';
import kleur from 'kleur';
import { createRequire } from 'node:module';
import { buildCmd } from './commands/build.js';
import { promoteCmd } from './commands/promote.js';
import { scaleCmd } from './commands/scale.js';
import { iterateCmd } from './commands/iterate.js';
import { loginCmd, logoutCmd } from './commands/login.js';
import { secretsCmd } from './commands/secrets.js';
import { configCmd } from './commands/config.js';
import { updateCmd, removeCmd } from './commands/self.js';
import { makeCategoryCmd } from './commands/adapter-cmd.js';
import { CATEGORIES } from './adapter-registry.js';
import { skillsCmd } from './commands/skills.js';

const program = new Command();

// Read the published version from package.json at runtime so `sh1pt -V`
// always reflects what npm/bun/pnpm actually installed. The dist build
// lives at packages/cli/dist/index.js, so '../package.json' resolves
// to the package root in both dev (tsx) and prod (node dist).
const pkg = createRequire(import.meta.url)('../package.json') as { version: string };

program
  .name('sh1pt')
  .description('Build. Promote. Scale. Iterate…')
  .version(pkg.version);

// Four primary verbs — one per word of the tagline. Each accepts --from
// <git|url|path|doc> to jump into the workflow against an existing asset.
// Entity-ops lives under `build` (see docs/prd/entityctl.md).
program.addCommand(buildCmd);      // build    · compile · entity-ops nested
program.addCommand(promoteCmd);    // promote  · publish (ship), ads, merch — anything that gets users
program.addCommand(scaleCmd);      // scale    · provision (deploy), DNS, rollouts, cost
program.addCommand(iterateCmd);    // iterate  · observe + agent-propose + ship + measure (agents nested)

// Auth + config utilities — cross-cutting, kept top-level for convention.
program.addCommand(loginCmd);
program.addCommand(logoutCmd);
program.addCommand(secretsCmd);
program.addCommand(configCmd);
program.addCommand(skillsCmd);      // skills   · package/promote SKILL.md agent skills across marketplaces

// Self-management — sh1pt update / upgrade / remove / uninstall.
program.addCommand(updateCmd);
program.addCommand(removeCmd);

// Filesystem-mirrored adapter commands. One top-level command per
// packages/<category>/ directory → `sh1pt <category> <name> setup`.
for (const cat of CATEGORIES) {
  program.addCommand(makeCategoryCmd(cat));
}

program.parseAsync(process.argv).catch((err) => {
  console.error(kleur.red(`error: ${err.message}`));
  process.exit(1);
});
