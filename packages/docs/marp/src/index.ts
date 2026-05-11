import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineDocs, exec, manualSetup, type DocFormat } from '@profullstack/sh1pt-core';

// Marp — open-source markdown → HTML / PDF / PPTX. Run via the marp CLI
// locally (no API, no auth). Perfect for "version-controlled pitch deck"
// flows — keep deck.md in git, regenerate on change.
interface Config {
  theme?: string;                   // built-in: 'default' | 'gaia' | 'uncover', or path to custom .css
  allowLocalFiles?: boolean;        // required when images are local paths
  outputDir?: string;               // default './.sh1pt/docs'
}

const supports: DocFormat[] = ['pptx', 'pdf', 'html'];

export default defineDocs<Config>({
  id: 'docs-marp',
  label: 'Marp (markdown → pptx/pdf/html, open-source)',
  supports,

  async generate(ctx, spec, config) {
    if (!spec.markdown) throw new Error('docs-marp requires spec.markdown');
    if (!supports.includes(spec.format)) throw new Error(`docs-marp does not support ${spec.format}`);

    const theme = config.theme ?? 'default';
    const outputDir = config.outputDir ?? './.sh1pt/docs';
    const outputPath = join(outputDir, `${safeFileName(spec.kind)}.${spec.format}`);
    ctx.log(`marp · theme=${theme} · format=${spec.format}`);
    if (ctx.dryRun) return { id: 'dry-run', format: spec.format, localPath: outputPath };

    await mkdir(outputDir, { recursive: true });
    const workDir = await mkdtemp(join(tmpdir(), 'sh1pt-marp-'));
    const inputPath = join(workDir, 'deck.md');
    await writeFile(inputPath, renderDeck(spec, theme), 'utf8');

    try {
      const args = ['--theme', theme, '--output', outputPath];
      if (config.allowLocalFiles) args.push('--allow-local-files');
      if (spec.format !== 'html') args.push(`--${spec.format}`);
      args.push(inputPath);

      await exec('marp', args, { log: ctx.log });
      return { id: `marp_${Date.now()}`, format: spec.format, localPath: outputPath };
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  },

  setup: manualSetup({
    label: "Marp (markdown slides)",
    vendorDocUrl: "https://marp.app/",
    steps: [
      "Install the Marp CLI: npm install -g @marp-team/marp-cli",
      "No auth \u2014 Marp runs fully locally",
    ],
  }),
});

function renderDeck(spec: { title: string; subtitle?: string; author?: string; markdown?: string }, theme: string): string {
  const frontMatter = [
    '---',
    'marp: true',
    `theme: ${JSON.stringify(theme)}`,
    `title: ${JSON.stringify(spec.title)}`,
  ];
  if (spec.subtitle) frontMatter.push(`description: ${JSON.stringify(spec.subtitle)}`);
  if (spec.author) frontMatter.push(`author: ${JSON.stringify(spec.author)}`);
  frontMatter.push('---', '');
  return `${frontMatter.join('\n')}${spec.markdown ?? ''}\n`;
}

function safeFileName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'deck';
}
