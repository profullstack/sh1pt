import { defineDocs, exec, manualSetup, type DocFormat } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Marp — open-source markdown → HTML / PDF / PPTX. Run via the marp CLI
// locally (no API, no auth). Perfect for "version-controlled pitch deck"
// flows — keep deck.md in git, regenerate on change.
interface Config {
  theme?: string;                   // built-in: 'default' | 'gaia' | 'uncover', or path to custom .css
  allowLocalFiles?: boolean;        // required when images are local paths
  outDir?: string;                  // default './.sh1pt/docs'
}

const SUPPORTED = new Set<DocFormat>(['pptx', 'pdf', 'html']);

export default defineDocs<Config>({
  id: 'docs-marp',
  label: 'Marp (markdown → pptx/pdf/html, open-source)',
  supports: ['pptx', 'pdf', 'html'],

  async generate(ctx, spec, config) {
    if (!spec.markdown) throw new Error('docs-marp requires spec.markdown');
    if (!SUPPORTED.has(spec.format)) throw new Error(`docs-marp does not support ${spec.format}`);

    const theme = config.theme ?? 'default';
    const outDir = config.outDir ?? join('.', '.sh1pt', 'docs');
    const baseName = safeName(spec.kind);
    const inputPath = join(outDir, `${baseName}.md`);
    const outputPath = join(outDir, `${baseName}.${spec.format}`);

    ctx.log(`marp · theme=${theme} · format=${spec.format}`);
    if (ctx.dryRun) return { id: 'dry-run', format: spec.format, localPath: outputPath };

    await mkdir(outDir, { recursive: true });
    await writeFile(inputPath, spec.markdown, 'utf-8');

    const args = marpArgs(inputPath, outputPath, spec.format, spec, config);
    try {
      await exec('marp', args, { log: ctx.log, throwOnNonZero: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith('command not found: marp')) {
        throw new Error('docs-marp requires Marp CLI on PATH. Install it with: npm install --save-dev @marp-team/marp-cli');
      }
      throw err;
    }

    return { id: `marp_${baseName}_${spec.format}`, format: spec.format, localPath: outputPath };
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

export function marpArgs(
  inputPath: string,
  outputPath: string,
  format: DocFormat,
  spec: { title?: string; subtitle?: string; author?: string },
  config: Config,
): string[] {
  const args = [inputPath, '-o', outputPath, '--theme', config.theme ?? 'default'];

  if (format === 'pdf') args.push('--pdf');
  if (format === 'pptx') args.push('--pptx');
  if (format === 'html') args.push('--html');
  if (config.allowLocalFiles) args.push('--allow-local-files');
  if (spec.title) args.push('--title', spec.title);
  if (spec.subtitle) args.push('--description', spec.subtitle);
  if (spec.author) args.push('--author', spec.author);

  return args;
}

function safeName(value: string): string {
  const name = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return name || 'document';
}
