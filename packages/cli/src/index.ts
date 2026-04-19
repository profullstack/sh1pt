import { Command } from 'commander';
import kleur from 'kleur';
import { init } from './commands/init.js';
import { login } from './commands/login.js';
import { build } from './commands/build.js';
import { ship } from './commands/ship.js';
import { status } from './commands/status.js';
import { targetsCmd } from './commands/targets.js';
import { secretsCmd } from './commands/secrets.js';
import { rollback } from './commands/rollback.js';
import { logsCmd } from './commands/logs.js';
import { lintCmd } from './commands/lint.js';
import { promoCmd } from './commands/promo.js';

const program = new Command();

program
  .name('sh1pt')
  .description('Ship one codebase to every platform, store, and registry.')
  .version('0.0.0');

program.command('init').description('Scaffold sh1pt.config.ts in the current project').action(init);
program.command('login').description('Authenticate with sh1pt cloud').action(login);

program
  .command('build')
  .description('Build one or more targets locally or in the cloud')
  .option('-t, --target <id...>', 'target ids to build (default: all enabled)')
  .option('-c, --channel <name>', 'release channel', 'stable')
  .option('--cloud', 'run build in sh1pt cloud instead of locally')
  .action(build);

program
  .command('ship')
  .description('Publish a built artifact to its target store/registry')
  .option('-t, --target <id...>', 'target ids to ship (default: all enabled)')
  .option('-c, --channel <name>', 'release channel', 'stable')
  .option('--dry-run', 'simulate without uploading')
  .option('--skip-lint', 'skip the pre-ship policy linter (not recommended)')
  .action(ship);

program
  .command('status')
  .description('Show release status across targets')
  .option('-t, --target <id>')
  .action(status);

program
  .command('rollback')
  .description('Roll back the latest release on one or more targets')
  .option('-t, --target <id...>')
  .action(rollback);

program
  .command('logs')
  .description('Tail build + ship logs')
  .option('-t, --target <id>')
  .option('-f, --follow')
  .action(logsCmd);

program
  .command('lint')
  .description('Check the manifest and account against store-policy rules')
  .option('--strict', 'exit non-zero on warnings as well as errors')
  .option('--json', 'machine-readable output')
  .action(lintCmd);

program.addCommand(targetsCmd);
program.addCommand(secretsCmd);
program.addCommand(promoCmd);

program.parseAsync(process.argv).catch((err) => {
  console.error(kleur.red(`error: ${err.message}`));
  process.exit(1);
});
