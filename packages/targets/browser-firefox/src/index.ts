import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  extensionId: string;       // AMO extension id, e.g. "{some-uuid}" or "myext@example.com"
  sourceDir?: string;        // defaults to "dist/" or "web-ext-artifacts/"
  channel?: 'listed' | 'unlisted';
}

export default defineTarget<Config>({
  id: 'browser-firefox',
  kind: 'browser-ext',
  label: 'Firefox Add-ons (AMO)',
  async build(ctx, config) {
    const src = config.sourceDir ?? 'dist/';
    ctx.log(`pack Firefox extension from ${src} using web-ext build`);
    // TODO: run `web-ext build --source-dir ${src} --artifacts-dir ${ctx.outDir}`
    // Validates manifest.json (v2 or v3) and zips into ctx.outDir
    return { artifact: `${ctx.outDir}/${config.extensionId.replace(/[{}@]/g, '_')}-${ctx.version}.zip` };
  },
  async ship(ctx, config) {
    const channel = config.channel ?? 'listed';
    ctx.log(`sign + submit ${config.extensionId} to AMO (channel: ${channel})`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: web-ext sign --api-key=${AMO_JWT_ISSUER} --api-secret=${AMO_JWT_SECRET}
    //       --channel=${channel} --source-dir ${config.sourceDir ?? 'dist/'}
    // Or: POST https://addons.mozilla.org/api/v5/addons/<id>/versions/ with JWT auth
    return {
      id: `${config.extensionId}@${ctx.version}`,
      url: `https://addons.mozilla.org/en-US/firefox/addon/${config.extensionId}/`,
    };
  },
  async status(id) {
    const [extId] = id.split('@');
    return { state: 'live', url: `https://addons.mozilla.org/en-US/firefox/addon/${extId}/` };
  },

  setup: manualSetup({
    label: 'Firefox Add-ons (AMO)',
    vendorDocUrl: 'https://addons.mozilla.org/en-US/developers/addon/api/key/',
    steps: [
      'Go to https://addons.mozilla.org/en-US/developers/addon/api/key/ and generate API credentials',
      'Run: sh1pt secret set AMO_JWT_ISSUER <jwt-issuer>',
      'Run: sh1pt secret set AMO_JWT_SECRET <jwt-secret>',
      'Ensure your extension has a valid manifest.json (v2 or v3)',
      'sh1pt uses web-ext to build, sign, and publish automatically',
    ],
  }),
});
