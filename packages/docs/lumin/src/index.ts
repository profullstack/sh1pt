import { defineDocs } from '@profullstack/sh1pt-core';

// LuminPDF — PDF editor + hosting. API supports upload, signature
// flows, form fill, and branded viewer links. NOT a presentation
// generator — use it to host/edit a pitch deck PDF that docs-marp or
// docs-gslides produces. Pair adapters on generate() → convert() → upload.
interface Config {
  workspaceId?: string;
}

export default defineDocs<Config>({
  id: 'docs-lumin',
  label: 'LuminPDF (PDF hosting + edit)',
  supports: ['pdf'],

  async generate(ctx, spec) {
    if (!ctx.secret('LUMIN_API_KEY')) throw new Error('LUMIN_API_KEY not in vault');
    if (spec.format !== 'pdf') {
      throw new Error(`docs-lumin only hosts PDFs — generate with docs-marp / docs-gslides first, then upload here`);
    }
    ctx.log(`lumin upload · "${spec.title}"`);
    if (ctx.dryRun) return { id: 'dry-run', format: 'pdf', url: 'https://app.luminpdf.com/viewer/stub' };
    // TODO: POST /api/v1/documents with multipart/form-data (file + metadata)
    // Returns a viewer URL you can share with investors / customers.
    return { id: `lumin_${Date.now()}`, format: 'pdf', url: 'https://app.luminpdf.com/viewer/stub' };
  },
});
