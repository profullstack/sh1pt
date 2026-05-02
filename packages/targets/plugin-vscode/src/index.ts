import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  publisher: string;      // e.g. "mycompany"
  extensionName: string;  // e.g. "my-extension"
}

export default defineTarget<Config>({
  id: 'plugin-vscode',
  kind: 'plugin',
  label: 'VS Code Marketplace',
  async build(ctx, config) {
    ctx.log(`package VS Code extension ${config.publisher}.${config.extensionName} v${ctx.version}`);
    // TODO: run `vsce package` to produce .vsix
    return { artifact: `${ctx.outDir}/${config.extensionName}-${ctx.version}.vsix` };
  },
  async ship(ctx, config) {
    ctx.log(`publish ${config.publisher}.${config.extensionName}@${ctx.version} to VS Code Marketplace`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: run `vsce publish` with VSCE_TOKEN from ctx.secret('VSCE_TOKEN')
    return {
      id: `${config.publisher}.${config.extensionName}@${ctx.version}`,
      url: `https://marketplace.visualstudio.com/items?itemName=${config.publisher}.${config.extensionName}`,
    };
  },
  async status(id) {
    const [extId] = id.split('@');
    return { state: 'live', url: `https://marketplace.visualstudio.com/items?itemName=${extId}` };
  },
  setup: manualSetup({
    label: 'VS Code Marketplace',
    vendorDocUrl: 'https://code.visualstudio.com/api/working-with-extensions/publishing-extension',
    steps: [
      'Create a publisher account at https://marketplace.visualstudio.com/manage',
      'Generate a Personal Access Token with Marketplace > Publish scope',
      'Run: sh1pt secret set VSCE_TOKEN <your-pat>',
      'Ensure package.json has publisher and name fields matching config',
    ],
  }),
});
