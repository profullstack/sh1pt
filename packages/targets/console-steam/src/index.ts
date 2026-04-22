import { defineTarget } from '@profullstack/sh1pt-core';

// Steam — desktop (Windows/macOS/Linux) and Steam Deck (SteamOS).
// The Deck is Arch-based Linux; apps run natively on Linux or through
// Proton from Windows builds. The Deck Verified program certifies
// controls/UI for the handheld form factor — opt-in via submission.
interface Config {
  steamAppId: number;
  depotIds: { platform: 'windows' | 'macos' | 'linux'; depotId: number }[];
  branch: 'default' | 'beta' | 'playtest' | (string & {});
  binariesDir: string;
  // Deck Verified submission — reviewed separately after regular publish
  submitDeckVerification?: boolean;
}

export default defineTarget<Config>({
  id: 'console-steam',
  kind: 'console',
  label: 'Steam / Steam Deck (SteamOS)',
  async build(ctx, config) {
    const platforms = config.depotIds.map((d) => d.platform).join(',');
    ctx.log(`prepare Steam depots · platforms=${platforms}`);
    // TODO: generate app_build.vdf + per-depot depot_build_*.vdf referencing config.binariesDir
    return { artifact: config.binariesDir };
  },
  async ship(ctx, config) {
    ctx.log(`steamcmd run_app_build · app=${config.steamAppId} · branch=${config.branch}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO:
    //  - steamcmd +login +run_app_build app_build.vdf
    //  - if submitDeckVerification: open Deck Compatibility submission form via Steamworks API
    return {
      id: `${config.steamAppId}@${ctx.version}`,
      url: `https://store.steampowered.com/app/${config.steamAppId}`,
    };
  },
  async status(id) {
    return { state: 'live', version: id };
  },
});
