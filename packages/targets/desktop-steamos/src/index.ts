import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

// SteamOS / Steam Deck — Desktop Mode path that bypasses Steam entirely.
// The Deck runs KDE Plasma on Arch in Desktop Mode and installs Flatpaks
// from Flathub. Use this target when:
//   - you don't want to pay Steam's 30% or go through store review
//   - your app isn't a game (Deck is increasingly used as a handheld PC)
//   - you want distribution that also reaches regular Linux desktops
//
// For Steam-distributed games that also target Deck Gaming Mode, use
// `console-steam` instead — it handles Steamworks depots + Deck
// Verified submission.
interface Config {
  appId: string;                                      // e.g. com.acme.myapp
  sourceDir: string;                                  // dir with built binary + assets
  distribution: 'flathub' | 'self-hosted';
  // optional: register as a non-Steam shortcut in Deck Gaming Mode
  gamingModeLauncher?: {
    enabled: boolean;
    artwork?: { hero?: string; logo?: string; grid?: string };
  };
  flatpakManifest?: string;                           // path to app.yml / app.json
  selfHosted?: { uploadTo: 'github-pages' | 'cdn' | 's3' };
}

export default defineTarget<Config>({
  id: 'desktop-steamos',
  kind: 'desktop',
  label: 'SteamOS / Steam Deck (Desktop Mode / Flatpak)',
  async build(ctx, config) {
    ctx.log(`flatpak-builder · appId=${config.appId}`);
    // TODO:
    //  - flatpak-builder --repo=repo build-dir <manifest>
    //  - flatpak build-bundle repo <appId>.flatpak <appId>
    //  - if gamingModeLauncher: generate Steam shortcuts.vdf entry + artwork
    return { artifact: `${ctx.outDir}/${config.appId}.flatpak` };
  },
  async ship(ctx, config) {
    const dest = config.distribution === 'flathub' ? 'Flathub PR' : `self-hosted (${config.selfHosted?.uploadTo})`;
    ctx.log(`publish ${config.appId}@${ctx.version} → ${dest}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO:
    //  - flathub:     open PR against flathub/flathub (like pkg-homebrew pattern)
    //  - self-hosted: sync repo dir with signed index to github-pages / cdn / s3
    return {
      id: `${config.appId}@${ctx.version}`,
      url: config.distribution === 'flathub' ? `https://flathub.org/apps/${config.appId}` : undefined,
    };
  },
  async status(id) {
    return { state: 'in-review', version: id };
  },

  setup: manualSetup({
    label: "Steam Deck (Desktop Mode Flatpak)",
    vendorDocUrl: "https://flathub.org/",
    steps: [
      "Steam Deck Desktop Mode uses Flathub",
      "Follow the desktop-linux Flathub flow \u2014 no Steam-specific auth needed here",
    ],
  }),
});
