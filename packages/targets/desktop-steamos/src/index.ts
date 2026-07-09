import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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

const APP_ID_PATTERN = /^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*)+$/;

function requireAppId(config: Config): string {
  const appId = config.appId?.trim();
  if (!appId) throw new Error('desktop-steamos requires appId');
  if (!APP_ID_PATTERN.test(appId)) {
    throw new Error('desktop-steamos appId must be a valid reverse-DNS identifier');
  }
  return appId;
}

export default defineTarget<Config>({
  id: 'desktop-steamos',
  kind: 'desktop',
  label: 'SteamOS / Steam Deck (Desktop Mode / Flatpak)',
  async build(ctx, config) {
    const appId = requireAppId(config);
    ctx.log(`flatpak-builder · appId=${config.appId}`);
    const artifactDir = join(ctx.outDir, 'steamos');
    const planPath = join(artifactDir, 'steamos-flatpak-plan.json');
    await mkdir(artifactDir, { recursive: true });
    await writeFile(planPath, `${JSON.stringify({
      appId,
      version: ctx.version,
      sourceDir: config.sourceDir,
      distribution: config.distribution,
      flatpakManifest: config.flatpakManifest,
      gamingModeLauncher: config.gamingModeLauncher,
      selfHosted: config.selfHosted,
      outputArtifact: `${appId}.flatpak`,
    }, null, 2)}\n`, 'utf-8');
    return { artifact: planPath };
  },
  async ship(ctx, config) {
    const appId = requireAppId(config);
    const dest = config.distribution === 'flathub' ? 'Flathub PR' : `self-hosted (${config.selfHosted?.uploadTo})`;
    ctx.log(`publish ${config.appId}@${ctx.version} → ${dest}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO:
    //  - flathub:     open PR against flathub/flathub (like pkg-homebrew pattern)
    //  - self-hosted: sync repo dir with signed index to github-pages / cdn / s3
    return {
      id: `${appId}@${ctx.version}`,
      url: config.distribution === 'flathub' ? `https://flathub.org/apps/${appId}` : undefined,
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
