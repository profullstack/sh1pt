import { defineTarget } from '@sh1pt/core';

// Pico Store (ByteDance). Android-based headset family (Pico 4, Pico
// Neo). Separate developer portal from Meta. Region splits matter —
// global store and China (Pico VR) have different review pipelines.
interface Config {
  appId: string;
  developerId: string;
  region: 'global' | 'cn' | 'both';
  apkPath?: string;
}

export default defineTarget<Config>({
  id: 'xr-pico',
  kind: 'xr',
  label: 'Pico Store',
  async build(ctx, config) {
    ctx.log(`gradle :pico:bundleRelease · region=${config.region}`);
    return { artifact: config.apkPath ?? `${ctx.outDir}/app-pico.apk` };
  },
  async ship(ctx, config) {
    ctx.log(`upload to Pico Developer Platform · app=${config.appId}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: developer.picoxr.com submission API
    return { id: `${config.appId}@${ctx.version}` };
  },
  async status(id) {
    return { state: 'in-review', version: id };
  },
});
