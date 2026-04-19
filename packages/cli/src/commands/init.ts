import { writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import prompts from 'prompts';
import kleur from 'kleur';

const TEMPLATE = (name: string) => `import { defineConfig } from '@sh1pt/core';

export default defineConfig({
  name: '${name}',
  version: '0.0.0',
  targets: {
    // add targets with \`sh1pt target add <id>\`
  },
});
`;

export async function init(): Promise<void> {
  const cfgPath = join(process.cwd(), 'sh1pt.config.ts');
  try {
    await access(cfgPath);
    console.log(kleur.yellow('sh1pt.config.ts already exists — aborting.'));
    return;
  } catch {
    // expected
  }

  const { name } = await prompts({
    type: 'text',
    name: 'name',
    message: 'Project name',
    initial: process.cwd().split('/').pop() ?? 'my-app',
  });

  if (!name) return;

  await writeFile(cfgPath, TEMPLATE(name), 'utf8');
  console.log(kleur.green(`✓ wrote sh1pt.config.ts`));
  console.log(`  next: ${kleur.cyan('sh1pt target add <id>')}`);
}
