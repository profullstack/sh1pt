import { Command } from 'commander';
import { writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import kleur from 'kleur';
import prompts from 'prompts';

const CONFIG_TEMPLATE = (name: string) => `import { defineConfig } from '@profullstack/sh1pt-core';

export default defineConfig({
  name: '${name}',
  version: '0.0.0',
  targets: {
    // add targets with \`sh1pt ship target add <id>\`
  },
});
`;

/**
 * Shared init action — scaffolds sh1pt.config.ts in the current project.
 * Used by both `sh1pt init` (top-level) and `sh1pt ship init` (sub-command).
 */
export async function initAction(): Promise<void> {
  const cfgPath = join(process.cwd(), 'sh1pt.config.ts');
  try {
    await access(cfgPath);
    console.log(kleur.yellow('sh1pt.config.ts already exists — aborting.'));
    return;
  } catch {
    // expected — file does not exist
  }
  const { name } = await prompts({
    type: 'text',
    name: 'name',
    message: 'Project name',
    initial: process.cwd().split('/').pop() ?? 'my-app',
  });
  if (!name) return;
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
  .action(initAction);
