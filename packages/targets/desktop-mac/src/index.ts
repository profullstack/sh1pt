import { defineTarget } from '@sh1pt/core';

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
    // TODO:
    //  - xcodebuild archive → exportArchive
    //  - if 'dmg' or 'both': create-dmg + notarytool submit --wait + staple
    //  - if 'mas' or 'both': export as mac-app-store .pkg for App Store Connect
    // Requires macOS runner; cloud builds route to a mac worker.
    return {
      artifact: config.distribution === 'dmg' ? `${ctx.outDir}/app.dmg` : `${ctx.outDir}/app.pkg`,
    };
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
});
