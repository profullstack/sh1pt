import { defineTarget } from '@profullstack/sh1pt-core';

// webOS apps are HTML/CSS/JS — a great fit for React codebases via Enact
// (LG's React-based framework) or vanilla web. Packaged as .ipk using
// LG's `ares` CLI, distributed through the LG Content Store.
interface Config {
  appId: string;                                      // e.g. com.acme.myapp
  sourceDir: string;                                  // built web app
  submission: 'lg-content-store' | 'developer-mode';  // dev-mode = sideload
  developerId?: string;                               // LG Seller Lounge id
}

export default defineTarget<Config>({
  id: 'tv-webos',
  kind: 'tv',
  label: 'LG Content Store (webOS)',
  async build(ctx, config) {
    ctx.log(`ares-package ${config.sourceDir} → .ipk`);
    // TODO:
    //  - validate appinfo.json (id, version, vendor, main, icon sizes)
    //  - `ares-package -o <out> <sourceDir>` → .ipk
    return { artifact: `${ctx.outDir}/${config.appId}.ipk` };
  },
  async ship(ctx, config) {
    const dest = config.submission === 'developer-mode' ? 'devkit (sideload)' : 'LG Content Store review';
    ctx.log(`publish ${config.appId}@${ctx.version} → ${dest}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO:
    //  - developer-mode: `ares-install` to paired dev-enabled TV
    //  - content-store: LG Seller Lounge submission API (manual upload currently;
    //    scrape-free API is limited — may require browser-driven submission in v0)
    return { id: `${config.appId}@${ctx.version}` };
  },
  async status(id) {
    return { state: 'in-review', version: id };
  },
});
