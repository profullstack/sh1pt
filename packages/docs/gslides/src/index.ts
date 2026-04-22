import { defineDocs } from '@profullstack/sh1pt-core';

// Google Slides — the practical way to generate a real editable .pptx.
// Flow: copy a template presentation → batchUpdate with
// replaceAllText (for variables) + insertImage (for screenshots) →
// export as .pptx or .pdf via Drive API.
interface Config {
  templatePresentationId?: string;  // copy this deck; users can maintain templates in their own Drive
  folderId?: string;                // where to store the generated copies
}

export default defineDocs<Config>({
  id: 'docs-gslides',
  label: 'Google Slides (pitch decks)',
  supports: ['pptx', 'pdf', 'html'],

  async generate(ctx, spec, config) {
    if (!ctx.secret('GOOGLE_OAUTH_REFRESH_TOKEN')) {
      throw new Error('GOOGLE_OAUTH_REFRESH_TOKEN not in vault (sh1pt login google)');
    }
    const templateId = spec.templateId ?? config.templatePresentationId;
    if (!templateId) {
      throw new Error('docs-gslides needs a templateId — copy a Google Slides deck, share with sh1pt, pass its ID');
    }
    ctx.log(`gslides · copy template ${templateId} · replace ${Object.keys(spec.variables ?? {}).length} vars`);
    if (ctx.dryRun) return { id: 'dry-run', format: spec.format, url: 'https://docs.google.com/presentation/d/stub' };
    // TODO:
    //   1. drive.files.copy(templateId) → new presentationId
    //   2. slides.presentations.batchUpdate({
    //        requests: [ { replaceAllText: { containsText: '{{var}}', replaceText: value } },
    //                    { insertImage: { url: assets.screenshots[i], ... } } ]
    //      })
    //   3. drive.files.export(presentationId, mimeType=spec.format) → buffer
    return { id: `gslides_${Date.now()}`, format: spec.format, url: 'https://docs.google.com/presentation/d/stub' };
  },
});
