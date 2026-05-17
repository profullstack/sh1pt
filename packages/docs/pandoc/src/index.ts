import { defineDocs, exec, manualSetup, type DocFormat } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Pandoc — universal document converter. Markdown → docx, pdf, html,
// pptx, and back. Strongest at long-form content (whitepapers, memos,
// proposals) where Marp's slide-centric model doesn't fit.
interface Config {
  referenceDoc?: string;            // e.g. './templates/brand.docx' for --reference-doc (docx/pptx styling)
  pdfEngine?: 'xelatex' | 'weasyprint' | 'wkhtmltopdf';
  metadata?: Record<string, string>;
  outDir?: string;                  // default './.sh1pt/docs'
}

const WRITERS: Partial<Record<DocFormat, string>> = {
  docx: 'docx',
  pdf: 'pdf',
  html: 'html5',
  pptx: 'pptx',
  md: 'markdown',
};

export default defineDocs<Config>({
  id: 'docs-pandoc',
  label: 'Pandoc (universal doc converter)',
  supports: ['docx', 'pdf', 'html', 'pptx', 'md'],

  async generate(ctx, spec, config) {
    if (!spec.markdown) throw new Error('docs-pandoc requires spec.markdown');
    const writer = WRITERS[spec.format];
    if (!writer) throw new Error(`docs-pandoc does not support ${spec.format}`);

    const outDir = config.outDir ?? join('.', '.sh1pt', 'docs');
    const baseName = safeName(spec.kind);
    const outputPath = join(outDir, `${baseName}.${spec.format}`);
    const inputPath = join(outDir, `${baseName}.md`);

    ctx.log(`pandoc · md → ${spec.format}${config.pdfEngine ? ` · ${config.pdfEngine}` : ''}`);
    if (ctx.dryRun) return { id: 'dry-run', format: spec.format, localPath: outputPath };

    await mkdir(outDir, { recursive: true });
    await writeFile(inputPath, spec.markdown, 'utf-8');

    if (spec.format === 'md') {
      await writeFile(outputPath, spec.markdown, 'utf-8');
      return { id: `pandoc_${baseName}_md`, format: spec.format, localPath: outputPath };
    }

    const args = pandocArgs(inputPath, outputPath, writer, config);
    try {
      await exec('pandoc', args, { log: ctx.log, throwOnNonZero: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith('command not found: pandoc')) {
        throw new Error('docs-pandoc requires pandoc on PATH. Install it from https://pandoc.org/installing.html');
      }
      throw err;
    }

    return { id: `pandoc_${baseName}_${spec.format}`, format: spec.format, localPath: outputPath };
  },

  setup: manualSetup({
    label: "Pandoc (universal document converter)",
    vendorDocUrl: "https://pandoc.org/installing.html",
    steps: [
      "Install pandoc: brew install pandoc / apt install pandoc / scoop install pandoc",
      "No auth \u2014 Pandoc runs fully locally",
    ],
  }),
});

function pandocArgs(inputPath: string, outputPath: string, writer: string, config: Config): string[] {
  const args = [inputPath, '-f', 'markdown', '-t', writer, '-o', outputPath];

  if (config.referenceDoc) args.push(`--reference-doc=${config.referenceDoc}`);
  if (config.pdfEngine) args.push(`--pdf-engine=${config.pdfEngine}`);
  for (const [key, value] of Object.entries(config.metadata ?? {})) {
    args.push('--metadata', `${key}=${value}`);
  }

  return args;
}

function safeName(value: string): string {
  const name = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return name || 'document';
}
