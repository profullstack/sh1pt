import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  bundleId: string;          // e.g. "com.example.MyApp.Extension"
  appleId?: string;          // Apple ID for App Store Connect
  teamId?: string;           // Apple Developer Team ID
  scheme?: string;           // Xcode scheme name
}

export default defineTarget<Config>({
  id: 'browser-safari',
  kind: 'browser-ext',
  label: 'App Store (Safari ext.)',
  async build(ctx, config) {
    ctx.log(`build Safari Web Extension for ${config.bundleId} v${ctx.version}`);
    // TODO: xcrun safari-web-extension-converter to wrap existing extension
    // TODO: xcodebuild archive -scheme ${config.scheme ?? 'App'}
    return { artifact: `${ctx.outDir}/${config.bundleId}-${ctx.version}.xcarchive` };
  },
  async ship(ctx, config) {
    ctx.log(`upload ${config.bundleId} to App Store Connect via altool / xcrun notarytool`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: xcrun altool --upload-app -f <ipa> -u ${appleId} -p ${APP_STORE_CONNECT_API_KEY}
    // Uses APP_STORE_CONNECT_KEY_ID + APP_STORE_CONNECT_ISSUER_ID + APP_STORE_CONNECT_PRIVATE_KEY
    return {
      id: `${config.bundleId}@${ctx.version}`,
      url: `https://apps.apple.com/app/${config.bundleId}`,
    };
  },
  async status(id) {
    const [bundleId] = id.split('@');
    return { state: 'live', url: `https://apps.apple.com/search?term=${bundleId}` };
  },
  setup: manualSetup({
    label: 'App Store (Safari ext.)',
    vendorDocUrl: 'https://developer.apple.com/documentation/safariservices/safari-web-extensions',
    steps: [
      'Enroll in Apple Developer Program (https://developer.apple.com/programs/)',
      'Generate an App Store Connect API Key at https://appstoreconnect.apple.com/access/api',
      'Run: sh1pt secret set APP_STORE_CONNECT_KEY_ID <key-id>',
      'Run: sh1pt secret set APP_STORE_CONNECT_ISSUER_ID <issuer-id>',
      'Run: sh1pt secret set APP_STORE_CONNECT_PRIVATE_KEY "$(cat AuthKey_<key-id>.p8)"',
      'Ensure Xcode project is configured with correct bundle ID and team',
    ],
  }),
});
