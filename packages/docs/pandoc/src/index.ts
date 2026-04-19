import { defineDocs } from '@sh1pt/core';

// Pandoc — universal document converter. Markdown → docx, pdf, html,
// pptx, and back. Strongest at long-form content (whitepapers, memos,
// proposals) where Marp's slide-centric model doesn't fit.
interface Config {
  referenceDoc?: string;            // e.g. './templates/brand.docx' for --reference-doc (docx/pptx styling)
  pdfEngine?: 'xelatex' | 'weasyprint' | 'wkhtmltopdf';
  metadata?: Record<string, string>;
}

export default defineDocs<Config>({
  id: 'docs-pandoc',
  label: 'Pandoc (universal doc converter)',
  supports: ['docx', 'pdf', 'html', 'pptx', 'md'],

  async generate(ctx, spec, config) {
    if (!spec.markdown) throw new Error('docs-pandoc requires spec.markdown');
    ctx.log(`pandoc · md → ${spec.format}${config.pdfEngine ? ` · ${config.pdfEngine}` : ''}`);
    if (ctx.dryRun) return { id: 'dry-run', format: spec.format, localPath: `./.sh1pt/docs/${spec.kind}.${spec.format}` };
    // TODO: spawn `pandoc -f markdown -t <spec.format> ${referenceDoc ? `--reference-doc=${referenceDoc}` : ''} -o <out> -` with markdown on stdin
    return { id: `pandoc_${Date.now()}`, format: spec.format, localPath: `./.sh1pt/docs/${spec.kind}.${spec.format}` };
  },
});
