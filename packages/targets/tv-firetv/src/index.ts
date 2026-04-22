import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  packageName: string;       // e.g. com.acme.myapp
  appSku: string;            // Amazon Appstore SKU
  // Fire TV ships an Android APK with <uses-feature android:name="android.software.leanback"/>
  // in the manifest. Same APK can serve phones if you drop the leanback requirement.
  apkPath?: string;
  deviceTargeting?: 'firetv-only' | 'firetv-and-phone';
}

export default defineTarget<Config>({
  id: 'tv-firetv',
  kind: 'tv',
  label: 'Amazon Appstore (Fire TV / Firestick)',
  async build(ctx, config) {
    ctx.log(`gradle :app:bundleRelease · targeting=${config.deviceTargeting ?? 'firetv-only'}`);
    // TODO:
    //  - verify AndroidManifest declares leanback feature + launcher intent
    //  - gradle assembleRelease → signed APK (Amazon Appstore requires APK, not AAB)
    return { artifact: config.apkPath ?? `${ctx.outDir}/app-release.apk` };
  },
  async ship(ctx, config) {
    ctx.log(`upload to Amazon Appstore · sku=${config.appSku}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: Amazon App Submission API (create edit → upload APK → submit)
    return {
      id: `${config.appSku}@${ctx.version}`,
      url: `https://www.amazon.com/gp/product/${config.appSku}`,
    };
  },
  async status(id) {
    return { state: 'in-review', version: id };
  },

  setup: manualSetup({
    label: "Fire TV (Amazon Appstore)",
    vendorDocUrl: "https://developer.amazon.com/apps-and-games/console/app/list",
    steps: [
      "Open developer.amazon.com/apps-and-games \u2014 register (free for Fire TV)",
      "Complete tax + payout onboarding",
      "Generate API keys in Account Settings \u2192 Security",
      "Run: sh1pt secret set AMAZON_APPSTORE_CLIENT_ID <id>",
      "Run: sh1pt secret set AMAZON_APPSTORE_CLIENT_SECRET <secret>",
    ],
  }),
});
