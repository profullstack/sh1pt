import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineDocs, exec, manualSetup, type DocFormat } from '@profullstack/sh1pt-core';

// Pandoc — universal document converter. Markdown → docx, pdf, html,
// pptx, and back. Strongest at long-form content (whitepapers, memos,
// proposals) where Marp's slide-centric model doesn't fit.
interface Config {
  referenceDoc?: string;            // e.g. './templates/brand.docx' for --reference-doc (docx/pptx styling)
  pdfEngine?: 'xelatex' | 'weasyprint' | 'wkhtmltopdf';
  metadata?: Record<string, string>;
  outputDir?: string;               // default './.sh1pt/docs'
}

const supports: DocFormat[] = ['docx', 'pdf', 'html', 'pptx', 'md'];

export default defineDocs<Config>({
  id: 'docs-pandoc',
  label: 'Pandoc (universal doc converter)',
  supports,

  async generate(ctx, spec, config) {
    if (!spec.markdown) throw new Error('docs-pandoc requires spec.markdown');
    if (!supports.includes(spec.format)) throw new Error(`docs-pandoc does not support ${spec.format}`);

    const outputDir = config.outputDir ?? './.sh1pt/docs';
    const outputPath = join(outputDir, `${safeFileName(spec.kind)}.${spec.format}`);
    ctx.log(`pandoc · md → ${spec.format}${config.pdfEngine ? ` · ${config.pdfEngine}` : ''}`);
    if (ctx.dryRun) return { id: 'dry-run', format: spec.format, localPath: outputPath };

    await mkdir(outputDir, { recursive: true });
    const workDir = await mkdtemp(join(tmpdir(), 'sh1pt-pandoc-'));
    const inputPath = join(workDir, 'input.md');
    await writeFile(inputPath, renderMarkdown(spec), 'utf8');

    try {
      const args = [
        '--from', 'markdown',
        '--to', pandocFormat(spec.format),
        '--output', outputPath,
      ];
      if (config.referenceDoc && ['docx', 'pptx'].includes(spec.format)) {
        args.push(`--reference-doc=${config.referenceDoc}`);
      }
      if (config.pdfEngine && spec.format === 'pdf') {
        args.push(`--pdf-engine=${config.pdfEngine}`);
      }
      for (const [key, value] of Object.entries(config.metadata ?? {})) {
        args.push('--metadata', `${key}=${value}`);
      }
      args.push(inputPath);

      await exec('pandoc', args, { log: ctx.log });
      return { id: `pandoc_${Date.now()}`, format: spec.format, localPath: outputPath };
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
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

function renderMarkdown(spec: { title: string; subtitle?: string; author?: string; markdown?: string }): string {
  const frontMatter: string[] = ['---', `title: ${JSON.stringify(spec.title)}`];
  if (spec.subtitle) frontMatter.push(`subtitle: ${JSON.stringify(spec.subtitle)}`);
  if (spec.author) frontMatter.push(`author: ${JSON.stringify(spec.author)}`);
  frontMatter.push('---', '');
  return `${frontMatter.join('\n')}${spec.markdown ?? ''}\n`;
}

function pandocFormat(format: string): string {
  if (format === 'md') return 'markdown';
  return format;
}

function safeFileName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
}
