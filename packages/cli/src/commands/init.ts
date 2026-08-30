import { Command } from 'commander';
import { writeFile, access } from 'node:fs/promises';
import { join, basename } from 'node:path';
import kleur from 'kleur';
import prompts from 'prompts';

export const CONFIG_TEMPLATE = (name: string) => `import { defineConfig } from '@profullstack/sh1pt-core';

export default defineConfig({
  name: ${JSON.stringify(name)},
  version: '0.0.0',
  targets: {
    // add targets with \`sh1pt ship target add <id>\`
  },
});
`;

export interface InitOptions {
  name?: string;
}

/**
 * Shared init action — scaffolds sh1pt.config.ts in the current project.
 * Used by both `sh1pt init` (top-level) and `sh1pt ship init` (sub-command).
 */
export async function initAction(opts: InitOptions = {}): Promise<void> {
  const cfgPath = join(process.cwd(), 'sh1pt.config.ts');
  try {
    await access(cfgPath);
    console.log(kleur.yellow('sh1pt.config.ts already exists — aborting.'));
    return;
  } catch {
    // expected — file does not exist
  }

  let name = opts.name;
  if (!name) {
    if (!process.stdin.isTTY) {
      // `prompts` reads keystrokes from stdin. When stdin is not a TTY (CI, `< /dev/null`,
      // a piped script with no bytes) it never receives input that resolves or cancels the
      // prompt, and once nothing else is keeping the event loop alive Node exits on its own —
      // abandoning the still-pending `await prompts(...)` below without ever running the code
      // after it. That used to exit 0 without writing sh1pt.config.ts, so a script/CI step had
      // no way to tell init had failed. Fail fast instead of awaiting a prompt that can never
      // settle; `--name` is the non-interactive escape hatch.
      console.error(
        kleur.red(
          'sh1pt init needs an interactive terminal to ask for the project name — no TTY detected (running in CI or a piped script?). Pass --name <name> to run non-interactively.',
        ),
      );
      process.exitCode = 1;
      return;
    }
    const answer = await prompts({
      type: 'text',
      name: 'name',
      message: 'Project name',
      initial: basename(process.cwd()) || 'my-app',
    });
    name = answer.name;
  }
  if (!name) {
    // `prompts` resolves to `{}` (no `name` key) instead of rejecting when the
    // prompt is cancelled — e.g. Ctrl+C. Returning here silently used to exit 0
    // without writing sh1pt.config.ts, so a script or CI step could not tell
    // init had failed.
    console.error(kleur.red('sh1pt.config.ts not written — no project name provided (prompt cancelled).'));
    process.exitCode = 1;
    return;
  }
  await writeFile(cfgPath, CONFIG_TEMPLATE(name), 'utf8');
  console.log(kleur.green('✓ wrote sh1pt.config.ts'));
  console.log(`  next: ${kleur.cyan('sh1pt ship target add <id>')}`);
}

/**
 * Top-level `sh1pt init` command — an alias for `sh1pt ship init`.
 * The README documents `sh1pt init` as the primary way to scaffold a project config.
 */
export const initCmd = new Command('init')
  .description('Scaffold sh1pt.config.ts in the current project')
  .option('--name <name>', 'Project name — skips the interactive prompt')
  .action(initAction);
