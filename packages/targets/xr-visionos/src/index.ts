import { defineTarget } from '@profullstack/sh1pt-core';

// Apple Vision Pro (visionOS). Ships via App Store Connect like iOS /
// tvOS but with the xrOS SDK. Three app modes: native immersive
// (RealityKit), "designed for iPad/iPhone" compatibility, SwiftUI windows.
interface Config {
  bundleId: string;
  teamId: string;
  scheme?: string;
  mode: 'fully-immersive' | 'shared-space' | 'ipad-compatible';
  testflightGroups?: string[];
}

export default defineTarget<Config>({
  id: 'xr-visionos',
  kind: 'xr',
  label: 'App Store (Apple Vision Pro / visionOS)',
  async build(ctx, config) {
    ctx.log(`xcodebuild archive · -sdk xros · mode=${config.mode}`);
    // TODO: xcodebuild -sdk xros archive → exportArchive → .ipa
    // Requires macOS runner with Xcode + visionOS SDK.
    return { artifact: `${ctx.outDir}/app-visionos.ipa` };
  },
  async ship(ctx, config) {
    const destination = ctx.channel === 'stable' ? 'App Store (visionOS)' : `TestFlight:${config.testflightGroups?.join(',') ?? 'internal'}`;
    ctx.log(`upload to ${destination}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: altool upload with APP_STORE_CONNECT_KEY
    return { id: `${config.bundleId}@${ctx.version}` };
  },
  async status(id) {
    return { state: 'in-review', version: id };
  },
});
