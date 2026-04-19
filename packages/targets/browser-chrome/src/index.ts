import { defineTarget } from '@sh1pt/core';

interface Config {
  extensionId: string;
  sourceDir?: string;
  deployPercent?: number;
}

export default defineTarget<Config>({
  id: 'browser-chrome',
  kind: 'browser-ext',
  label: 'Chrome Web Store',
  async build(ctx, config) {
    ctx.log(`zip extension from ${config.sourceDir ?? 'dist/'}`);
    // TODO: verify manifest.json, zip into ctx.outDir
    return { artifact: `${ctx.outDir}/extension.zip` };
  },
  async ship(ctx, config) {
    ctx.log(`upload + publish extension ${config.extensionId}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: Chrome Web Store Publish API w/ refresh token
    return {
      id: `${config.extensionId}@${ctx.version}`,
      url: `https://chrome.google.com/webstore/detail/${config.extensionId}`,
    };
  },
});
