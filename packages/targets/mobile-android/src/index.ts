import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  packageName: string;    // e.g. "com.example.myapp"
  track?: 'internal' | 'alpha' | 'beta' | 'production';
}

export default defineTarget<Config>({
  id: 'mobile-android',
  kind: 'mobile',
  label: 'Google Play Store',
  async build(ctx, config) {
    ctx.log(`build Android AAB for ${config.packageName} v${ctx.version}`);
    // TODO: run Gradle bundleRelease to produce signed .aab
    return { artifact: `${ctx.outDir}/${config.packageName}-${ctx.version}.aab` };
  },
  async ship(ctx, config) {
    const track = config.track ?? 'internal';
    ctx.log(`upload ${config.packageName}@${ctx.version} to Google Play track: ${track}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: use Google Play Developer API v3 to upload AAB
    // Uses GOOGLE_PLAY_JSON from ctx.secret('GOOGLE_PLAY_JSON') (service account key)
    return {
      id: `${config.packageName}@${ctx.version}`,
      url: `https://play.google.com/store/apps/details?id=${config.packageName}`,
    };
  },
  async status(id) {
    const [packageName] = id.split('@');
    return { state: 'live', url: `https://play.google.com/store/apps/details?id=${packageName}` };
  },
  setup: manualSetup({
    label: 'Google Play Store',
    vendorDocUrl: 'https://developer.android.com/distribute/googleplay/developer-api',
    steps: [
      'Create a Google Play Developer account at https://play.google.com/console',
      'Enable Google Play Developer API in Google Cloud Console',
      'Create a service account with Release Manager access, download JSON key',
      'Run: sh1pt secret set GOOGLE_PLAY_JSON "$(cat service-account.json)"',
      'Set packageName to your app application ID (e.g. com.example.myapp)',
    ],
  }),
});
