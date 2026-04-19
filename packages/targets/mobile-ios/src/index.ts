import { defineTarget } from '@sh1pt/core';

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
});
