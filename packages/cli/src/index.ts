import { Command } from 'commander';
import kleur from 'kleur';
import { buildCmd } from './commands/build.js';
import { deployCmd } from './commands/deploy.js';
import { shipCmd } from './commands/ship.js';
import { promoteCmd } from './commands/promote.js';
import { agentsCmd } from './commands/agents.js';
import { loginCmd } from './commands/login.js';
import { secretsCmd } from './commands/secrets.js';

const program = new Command();

program
  .name('sh1pt')
  .description('Ship one codebase to every platform, store, and registry — then promote it everywhere.')
  .version('0.0.0');

// Primary verbs.
program.addCommand(buildCmd);      // compile
program.addCommand(deployCmd);     // provision cloud infra (VPS / GPU / bare metal)
program.addCommand(shipCmd);       // publish to stores / registries
program.addCommand(promoteCmd);    // run ads across every ad network
program.addCommand(agentsCmd);     // drive AI CLIs (Claude / Codex / Qwen) to build + iterate

// Cross-cutting utilities.
program.addCommand(loginCmd);
program.addCommand(secretsCmd);

program.parseAsync(process.argv).catch((err) => {
  console.error(kleur.red(`error: ${err.message}`));
  process.exit(1);
});
