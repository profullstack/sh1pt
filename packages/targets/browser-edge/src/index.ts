import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  productId: string;         // Edge Partner Center product ID
  sourceDir?: string;        // defaults to "dist/"
  notes?: string;            // release notes for reviewer
}

export default defineTarget<Config>({
  id: 'browser-edge',
  kind: 'browser-ext',
  label: 'Microsoft Edge Add-ons',
  async build(ctx, config) {
    const src = config.sourceDir ?? 'dist/';
    ctx.log(`pack Edge extension from ${src} for v${ctx.version}`);
    // TODO: zip extension directory, validate manifest_version 3
    return { artifact: `${ctx.outDir}/${config.productId}-${ctx.version}.zip` };
  },
  async ship(ctx, config) {
    ctx.log(`upload ${config.productId} to Edge Partner Center (v${ctx.version})`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: POST /v1/products/{productId}/submissions via Edge Publish API
    // Uses EDGE_CLIENT_ID + EDGE_CLIENT_SECRET + EDGE_ACCESS_TOKEN_URL from ctx.secret()
    return {
      id: `${config.productId}@${ctx.version}`,
      url: `https://microsoftedge.microsoft.com/addons/detail/${config.productId}`,
    };
  },
  async status(id) {
    const [productId] = id.split('@');
    return { state: 'live', url: `https://microsoftedge.microsoft.com/addons/detail/${productId}` };
  },
  setup: manualSetup({
    label: 'Microsoft Edge Add-ons',
    vendorDocUrl: 'https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/using-addons-api',
    steps: [
      'Go to https://partner.microsoft.com/dashboard/ and register your extension',
      'Create an API credential under Account \u2192 API credentials',
      'Run: sh1pt secret set EDGE_CLIENT_ID <client-id>',
      'Run: sh1pt secret set EDGE_CLIENT_SECRET <client-secret>',
      'Run: sh1pt secret set EDGE_ACCESS_TOKEN_URL <token-url>',
      'sh1pt uses the Edge Add-ons Publish API to upload and submit automatically',
    ],
  }),
});
