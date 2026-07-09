import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { join } from 'node:path';

interface Config {
  packageName: string;    // e.g. "com.example.myapp"
  track?: 'internal' | 'alpha' | 'beta' | 'production';
}

const ANDROID_PACKAGE_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

function safeFileStem(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^\.+|\.+$/g, '')
    .replace(/^-+|-+$/g, '') || 'android-app';
}

function requirePackageName(config: Config): string {
  const packageName = config.packageName?.trim();
  if (!packageName || !ANDROID_PACKAGE_NAME_RE.test(packageName)) {
    throw new Error(`mobile-android packageName must be a valid Android application ID, got "${config.packageName}"`);
  }
  return packageName;
}

export default defineTarget<Config>({
  id: 'mobile-android',
  kind: 'mobile',
  label: 'Google Play Store',
  async build(ctx, config) {
    const packageName = requirePackageName(config);
    ctx.log(`build Android AAB for ${packageName} v${ctx.version}`);
    // TODO: run Gradle bundleRelease to produce signed .aab
    return { artifact: join(ctx.outDir, `${safeFileStem(packageName)}-${safeFileStem(ctx.version)}.aab`) };
  },
  async ship(ctx, config) {
    const packageName = requirePackageName(config);
    const track = config.track ?? 'internal';
    ctx.log(`upload ${packageName}@${ctx.version} to Google Play track: ${track}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: use Google Play Developer API v3 to upload AAB
    // Uses GOOGLE_PLAY_JSON from ctx.secret('GOOGLE_PLAY_JSON') (service account key)
    return {
      id: `${packageName}@${ctx.version}`,
      url: `https://play.google.com/store/apps/details?id=${packageName}`,
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
