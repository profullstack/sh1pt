import { Command } from 'commander';
import kleur from 'kleur';
import { buildCmd } from './commands/build.js';
import { deployCmd } from './commands/deploy.js';
import { shipCmd } from './commands/ship.js';
import { promoteCmd } from './commands/promote.js';
import { scaleCmd } from './commands/scale.js';
import { iterateCmd } from './commands/iterate.js';
import { agentsCmd } from './commands/agents.js';
import { loginCmd } from './commands/login.js';
import { secretsCmd } from './commands/secrets.js';

const program = new Command();

program
  .name('sh1pt')
  .description('Build. Promote. Scale. Iterate…')
  .version('0.0.0');

// Primary verbs — map to the tagline lifecycle.
program.addCommand(buildCmd);      // build · compile
program.addCommand(deployCmd);     //        provision raw cloud infra (VPS / GPU / bare metal)
program.addCommand(shipCmd);       //        publish to stores / registries / channels
program.addCommand(promoteCmd);    // promote · run ads across every ad network
program.addCommand(scaleCmd);      // scale   · horizontal scale, round-robin DNS, rollouts, cost
program.addCommand(iterateCmd);    // iterate · observe metrics → agent proposes → ship → measure
program.addCommand(agentsCmd);     // (plumbing) drive Claude / Codex / Qwen CLIs

// Cross-cutting utilities.
program.addCommand(loginCmd);
program.addCommand(secretsCmd);

program.parseAsync(process.argv).catch((err) => {
  console.error(kleur.red(`error: ${err.message}`));
  process.exit(1);
});
