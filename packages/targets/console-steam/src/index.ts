import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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

function positiveInteger(value: number | undefined, field: string): number {
  if (!Number.isInteger(value) || value === undefined || value <= 0) {
    throw new Error(`console-steam ${field} must be a positive integer`);
  }
  return value;
}

function requireValue(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`console-steam requires ${field}`);
  return trimmed;
}

function branch(value: string | undefined): string {
  const name = requireValue(value, 'branch');
  if (/\s/.test(name)) throw new Error('console-steam branch must not contain whitespace');
  return name;
}

function depotIds(values: Config['depotIds'] | undefined): Config['depotIds'] {
  if (!values?.length) throw new Error('console-steam requires at least one depot');
  const seen = new Set<string>();
  return values.map((depot) => {
    if (depot.platform !== 'windows' && depot.platform !== 'macos' && depot.platform !== 'linux') {
      throw new Error('console-steam depot platform must be windows, macos, or linux');
    }
    if (seen.has(depot.platform)) throw new Error(`console-steam duplicate depot platform: ${depot.platform}`);
    seen.add(depot.platform);
    return {
      platform: depot.platform,
      depotId: positiveInteger(depot.depotId, 'depotId'),
    };
  });
}

function normalizedConfig(config: Config): Config {
  return {
    ...config,
    steamAppId: positiveInteger(config.steamAppId, 'steamAppId'),
    depotIds: depotIds(config.depotIds),
    branch: branch(config.branch),
    binariesDir: requireValue(config.binariesDir, 'binariesDir'),
  };
}

export default defineTarget<Config>({
  id: 'console-steam',
  kind: 'console',
  label: 'Steam / Steam Deck (SteamOS)',
  async build(ctx, config) {
    config = normalizedConfig(config);
    const platforms = config.depotIds.map((d) => d.platform).join(',');
    ctx.log(`prepare Steam depots · platforms=${platforms}`);
    const artifactDir = join(ctx.outDir, 'steam');
    const planPath = join(artifactDir, 'steam-build-plan.json');
    await mkdir(artifactDir, { recursive: true });
    await writeFile(planPath, `${JSON.stringify({
      steamAppId: config.steamAppId,
      depotIds: config.depotIds,
      branch: config.branch,
      binariesDir: config.binariesDir,
      submitDeckVerification: !!config.submitDeckVerification,
    }, null, 2)}\n`, 'utf-8');
    return { artifact: planPath };
  },
  async ship(ctx, config) {
    config = normalizedConfig(config);
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

  setup: manualSetup({
    label: "Steam (Steamworks)",
    vendorDocUrl: "https://partner.steamgames.com/",
    steps: [
      "Register as a Steamworks publisher ($100 per app fee)",
      "Complete tax + payout onboarding (required before publishing)",
      "Download the Steamworks SDK; generate a publisher web-API key",
      "Run: sh1pt secret set STEAM_PUBLISHER_WEB_API_KEY <key>",
    ],
  }),
});
