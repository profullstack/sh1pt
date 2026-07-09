import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import kleur from 'kleur';

export const logicsrcCmd = new Command('logicsrc')
  .description('Run LogicSRC OpenSpec workflows from the sh1pt CLI.')
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('[args...]', 'arguments passed to the logicsrc CLI')
  .option('--openspec', 'enable OpenSpec.dev-compatible repo-local spec workflows where supported')
  .option('--openspec-only', 'restrict this workflow to LogicSRC OpenSpec surfaces')
  .action((args: string[] = [], opts: { openspec?: boolean; openspecOnly?: boolean }) => {
    if (args.length === 0) {
      console.log(kleur.bold('LogicSRC OpenSpec mode'));
      console.log('Use sh1pt logicsrc <args...> to run the installed logicsrc CLI from sh1pt.');
      console.log('Use --openspec-only when a workflow must stay inside LogicSRC schemas, SDKs, MCP, CLI, TUI, and PWA contracts.');
      console.log();
      console.log('Examples:');
      console.log('  sh1pt logicsrc plugins');
      console.log('  sh1pt logicsrc --openspec agentswarm --yolo --repo profullstack/logicsrc');
      console.log('  sh1pt logicsrc --openspec-only task validate ./task.yaml');
      console.log('  sh1pt logicsrc --openspec-only agentswarm --yolo --repo profullstack/logicsrc');
      console.log('  sh1pt logicsrc agentbyte session audit --session ssn_123');
      return;
    }

    const result = spawnSync('logicsrc', args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        LOGICSRC_OPENSPEC_COMPAT: opts.openspec ? '1' : process.env.LOGICSRC_OPENSPEC_COMPAT,
        LOGICSRC_OPENSPEC_ONLY: opts.openspecOnly ? '1' : process.env.LOGICSRC_OPENSPEC_ONLY,
      },
    });

    if (result.error) {
      throw new Error(`Unable to run logicsrc. Install it with: npm install -g @logicsrc/cli`);
    }

    process.exitCode = result.status ?? 1;
  });
