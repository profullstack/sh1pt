import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  pluginId: string;         // Numeric JetBrains Plugin ID
  channel?: 'stable' | 'eap';
}

export default defineTarget<Config>({
  id: 'plugin-jetbrains',
  kind: 'plugin',
  label: 'JetBrains Marketplace',
  async build(ctx, config) {
    ctx.log(`build JetBrains plugin ${config.pluginId} v${ctx.version}`);
    // TODO: run Gradle bundlePlugin / buildPlugin task to produce plugin zip
    return { artifact: `${ctx.outDir}/plugin-${ctx.version}.zip` };
  },
  async ship(ctx, config) {
    const channel = config.channel ?? 'stable';
    ctx.log(`upload JetBrains plugin ${config.pluginId}@${ctx.version} to channel: ${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: POST zip to https://plugins.jetbrains.com/api/plugins/{pluginId}/upload
    // Uses JETBRAINS_TOKEN from ctx.secret('JETBRAINS_TOKEN')
    return {
      id: `${config.pluginId}@${ctx.version}`,
      url: `https://plugins.jetbrains.com/plugin/${config.pluginId}`,
    };
  },
  async status(id) {
    const [pluginId] = id.split('@');
    return { state: 'live', url: `https://plugins.jetbrains.com/plugin/${pluginId}` };
  },
  setup: manualSetup({
    label: 'JetBrains Marketplace',
    vendorDocUrl: 'https://plugins.jetbrains.com/docs/intellij/publishing-plugin.html',
    steps: [
      'Register your plugin at https://plugins.jetbrains.com',
      'Note the numeric plugin ID from the plugin page URL',
      'Generate a Permanent Token at https://plugins.jetbrains.com/author/me/tokens',
      'Run: sh1pt secret set JETBRAINS_TOKEN <your-token>',
    ],
  }),
});
