import { defineTarget } from '@profullstack/sh1pt-core';

// PCVR via Steam. Covers Valve Index, HTC Vive, Meta Rift / Quest Link,
// Bigscreen Beyond, and any OpenXR-compatible PC headset. Build is a
// regular PC executable flagged with VR support in the Steamworks
// depot config.
interface Config {
  steamAppId: number;
  depotIds: number[];
  branch: 'default' | 'beta' | 'playtest' | (string & {});
  binariesDir: string;
}

export default defineTarget<Config>({
  id: 'xr-steamvr',
  kind: 'xr',
  label: 'Steam (PCVR / SteamVR / OpenXR)',
  async build(ctx, config) {
    ctx.log(`prepare Steam depot content from ${config.binariesDir}`);
    // TODO: verify OpenXR runtime manifest, generate app_build.vdf
    return { artifact: config.binariesDir };
  },
  async ship(ctx, config) {
    ctx.log(`steamcmd run_app_build · app=${config.steamAppId} · branch=${config.branch}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: steamcmd +login builduser +run_app_build app_build.vdf
    return {
      id: `${config.steamAppId}@${ctx.version}`,
      url: `https://store.steampowered.com/app/${config.steamAppId}`,
    };
  },
});
