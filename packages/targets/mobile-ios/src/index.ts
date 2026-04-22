import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  bundleId: string;
  teamId: string;
  scheme?: string;
  exportMethod?: 'app-store' | 'ad-hoc' | 'enterprise' | 'development';
  testflightGroups?: string[];
}

export default defineTarget<Config>({
  id: 'mobile-ios',
  kind: 'mobile',
  label: 'App Store (iOS)',
  async build(ctx, config) {
    ctx.log(`xcodebuild archive · scheme=${config.scheme ?? ctx.projectDir}`);
    // TODO: xcodebuild archive → exportArchive → .ipa in ctx.outDir
    // requires macOS runner; cloud builds will route to a mac worker
    return { artifact: `${ctx.outDir}/app.ipa` };
  },
  async ship(ctx, config) {
    const destination = ctx.channel === 'stable' ? 'App Store' : `TestFlight:${config.testflightGroups?.join(',') ?? 'internal'}`;
    ctx.log(`upload to ${destination} via App Store Connect API`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: altool / notarytool upload using APP_STORE_CONNECT_KEY from secrets
    return { id: `${config.bundleId}@${ctx.version}` };
  },
  async status(id) {
    return { state: 'in-review', version: id };
  },

  setup: manualSetup({
    label: "iOS App Store",
    vendorDocUrl: "https://developer.apple.com/",
    steps: [
      "Enroll in Apple Developer Program ($99/yr) + D-U-N-S (free, 1-2 days)",
      "Accept all Paid Apps agreements in App Store Connect",
      "Generate an App Store Connect API key (.p8 file) with Developer role",
      "Run: sh1pt secret set APP_STORE_CONNECT_KEY_ID <id>",
      "Run: sh1pt secret set APP_STORE_CONNECT_ISSUER_ID <uuid>",
    ],
  }),
});
