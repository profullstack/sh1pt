import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { defineDocs, manualSetup, type DocFormat } from '@profullstack/sh1pt-core';

// Marp - open-source markdown to HTML / PDF / PPTX. Run via the marp CLI
// locally (no API, no auth). Perfect for "version-controlled pitch deck"
// flows - keep deck.md in git, regenerate on change.
interface Config {
  theme?: string;                   // built-in: 'default' | 'gaia' | 'uncover', or path to custom .css
  allowLocalFiles?: boolean;        // required when images are local paths
  binary?: string;                  // override when marp is not on PATH
  outDir?: string;                  // defaults to ./.sh1pt/docs
}

const MARP_FORMAT_FLAGS: Partial<Record<DocFormat, string>> = {
  pptx: '--pptx',
  pdf: '--pdf',
  html: '--html',
};

export default defineDocs<Config>({
  id: 'docs-marp',
  label: 'Marp (markdown -> pptx/pdf/html, open-source)',
  supports: ['pptx', 'pdf', 'html'],

  async generate(ctx, spec, config) {
    if (!spec.markdown) throw new Error('docs-marp requires spec.markdown');
    const formatFlag = MARP_FORMAT_FLAGS[spec.format];
    if (!formatFlag) throw new Error(`docs-marp does not support ${spec.format}`);

    const theme = config.theme ?? 'default';
    const outDir = config.outDir ?? './.sh1pt/docs';
    const localPath = join(outDir, `${spec.kind}.${spec.format}`);
    ctx.log(`marp - theme=${theme} - format=${spec.format} - output=${localPath}`);
    if (ctx.dryRun) return { id: 'dry-run', format: spec.format, localPath };

    await mkdir(dirname(localPath), { recursive: true });
    await runMarp({
      binary: config.binary ?? 'marp',
      markdown: spec.markdown,
      args: [
        '--theme',
        theme,
        formatFlag,
        '--output',
        localPath,
        ...(config.allowLocalFiles ? ['--allow-local-files'] : []),
        '-',
      ],
    });

    return { id: `marp_${Date.now()}`, format: spec.format, localPath };
  },

  setup: manualSetup({
    label: 'Marp (markdown slides)',
    vendorDocUrl: 'https://marp.app/',
    steps: [
      'Install the Marp CLI: npm install -g @marp-team/marp-cli',
      'No auth - Marp runs fully locally',
    ],
  }),
});

interface RunMarpOptions {
  binary: string;
  args: string[];
  markdown: string;
}

function runMarp(options: RunMarpOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.binary, options.args, {
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    const stderr: Buffer[] = [];

    child.stderr.on('data', (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const message = Buffer.concat(stderr).toString('utf8').trim();
      reject(new Error(`marp exited with code ${code}${message ? `: ${message}` : ''}`));
    });
    child.stdin.end(options.markdown);
  });
}
