import { defineDocs, manualSetup } from '@profullstack/sh1pt-core';

// Marp — open-source markdown → HTML / PDF / PPTX. Run via the marp CLI
// locally (no API, no auth). Perfect for "version-controlled pitch deck"
// flows — keep deck.md in git, regenerate on change.
interface Config {
  theme?: string;                   // built-in: 'default' | 'gaia' | 'uncover', or path to custom .css
  allowLocalFiles?: boolean;        // required when images are local paths
}

export default defineDocs<Config>({
  id: 'docs-marp',
  label: 'Marp (markdown → pptx/pdf/html, open-source)',
  supports: ['pptx', 'pdf', 'html'],

  async generate(ctx, spec, config) {
    if (!spec.markdown) throw new Error('docs-marp requires spec.markdown');
    const theme = config.theme ?? 'default';
    ctx.log(`marp · theme=${theme} · format=${spec.format}`);
    if (ctx.dryRun) return { id: 'dry-run', format: spec.format, localPath: `./.sh1pt/docs/${spec.kind}.${spec.format}` };
    // TODO: spawn `marp --theme ${theme} [--allow-local-files] --${spec.format} --output <path> -` and pipe markdown via stdin.
    // Slides split on --- (horizontal rule) in the markdown.
    return { id: `marp_${Date.now()}`, format: spec.format, localPath: `./.sh1pt/docs/${spec.kind}.${spec.format}` };
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
