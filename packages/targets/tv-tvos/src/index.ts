import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  bundleId: string;
  teamId: string;
  scheme?: string;
  testflightGroups?: string[];
}

export default defineTarget<Config>({
  id: 'tv-tvos',
  kind: 'tv',
  label: 'App Store (Apple TV / tvOS)',
  async build(ctx, config) {
    ctx.log(`xcodebuild archive · tvOS · scheme=${config.scheme ?? 'default'}`);
    // TODO: xcodebuild -sdk appletvos archive → exportArchive → .ipa
    // Requires macOS runner with tvOS SDK.
    return { artifact: `${ctx.outDir}/app-tvos.ipa` };
  },
  async ship(ctx, config) {
    const destination = ctx.channel === 'stable' ? 'App Store (tvOS)' : `TestFlight:${config.testflightGroups?.join(',') ?? 'internal'}`;
    ctx.log(`upload to ${destination} via App Store Connect API`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: altool upload using APP_STORE_CONNECT_KEY from secrets
    return { id: `${config.bundleId}@${ctx.version}` };
  },
  async status(id) {
    return { state: 'in-review', version: id };
  },

  setup: manualSetup({
    label: "Apple TV (tvOS)",
    vendorDocUrl: "https://developer.apple.com/",
    steps: [
      "Same Apple Developer Program as iOS/macOS ($99/yr + D-U-N-S)",
      "App Store Connect \u2192 enable tvOS as a platform for your app",
      "Reuse APP_STORE_CONNECT_KEY_ID and APP_STORE_CONNECT_ISSUER_ID",
    ],
  }),
});
