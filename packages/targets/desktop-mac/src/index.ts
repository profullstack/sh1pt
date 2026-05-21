import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Config {
  bundleId: string;
  teamId: string;
  scheme?: string;
  // 'mas' = Mac App Store, 'dmg' = notarized outside-MAS DMG, 'both' = ship to both
  distribution: 'mas' | 'dmg' | 'both';
  entitlements?: string;
  signingIdentity?: string; // e.g. "Developer ID Application: ACME Inc (ABCDE12345)"
}

export default defineTarget<Config>({
  id: 'desktop-mac',
  kind: 'desktop',
  label: 'macOS (Mac App Store / notarized DMG)',
  async build(ctx, config) {
    ctx.log(`xcodebuild archive · distribution=${config.distribution}`);
    const artifactDir = join(ctx.outDir, 'macos');
    const planPath = join(artifactDir, 'macos-build-plan.json');
    await mkdir(artifactDir, { recursive: true });
    await writeFile(planPath, `${JSON.stringify({
      bundleId: config.bundleId,
      teamId: config.teamId,
      scheme: config.scheme,
      distribution: config.distribution,
      entitlements: config.entitlements,
      signingIdentity: config.signingIdentity,
      outputArtifact: config.distribution === 'dmg' ? 'app.dmg' : 'app.pkg',
    }, null, 2)}\n`, 'utf-8');
    return { artifact: planPath };
  },
  async ship(ctx, config) {
    const targets = config.distribution === 'both' ? ['App Store', 'DMG host'] : [config.distribution === 'mas' ? 'App Store' : 'DMG host'];
    ctx.log(`publish ${config.bundleId}@${ctx.version} → ${targets.join(', ')}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO:
    //  - MAS: altool upload to App Store Connect
    //  - DMG: upload to configured CDN/GitHub release + update Sparkle appcast
    return { id: `${config.bundleId}@${ctx.version}` };
  },
  async status(id) {
    return { state: 'in-review', version: id };
  },

  setup: manualSetup({
    label: "Mac App Store",
    vendorDocUrl: "https://developer.apple.com/",
    steps: [
      "Enroll in Apple Developer Program ($99/yr) + D-U-N-S (free, 1-2 days)",
      "App Store Connect \u2192 generate API key (.p8 file)",
      "Run: sh1pt secret set APP_STORE_CONNECT_KEY_ID <id>",
      "Run: sh1pt secret set APP_STORE_CONNECT_ISSUER_ID <uuid>",
      "Keep the .p8 file path in your sh1pt.config.ts (not the vault)",
    ],
  }),
});
