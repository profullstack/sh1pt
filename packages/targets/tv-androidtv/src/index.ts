import { defineTarget } from '@sh1pt/core';

interface Config {
  packageName: string;                                   // e.g. com.acme.myapp
  // Play Console "form factor" registration — Android TV gates via the
  // leanback launcher intent and the android.software.leanback feature.
  track: 'internal' | 'alpha' | 'beta' | 'production';
  aabPath?: string;
}

export default defineTarget<Config>({
  id: 'tv-androidtv',
  kind: 'tv',
  label: 'Play Store (Android TV)',
  async build(ctx, config) {
    ctx.log(`gradle :app:bundleRelease · track=${config.track}`);
    // TODO:
    //  - verify AndroidManifest declares:
    //    * <uses-feature android:name="android.software.leanback" android:required="true"/>
    //    * <category android:name="android.intent.category.LEANBACK_LAUNCHER"/>
    //  - gradle bundleRelease → signed .aab
    return { artifact: config.aabPath ?? `${ctx.outDir}/app-release.aab` };
  },
  async ship(ctx, config) {
    const track = ctx.channel === 'stable' ? config.track : ctx.channel === 'beta' ? 'beta' : 'internal';
    ctx.log(`upload to Play Console · package=${config.packageName} · track=${track}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: Google Play Developer Publishing API (edit → upload bundle → commit to track)
    return {
      id: `${config.packageName}@${ctx.version}`,
      url: `https://play.google.com/store/apps/details?id=${config.packageName}`,
    };
  },
  async status(id) {
    return { state: 'in-review', version: id };
  },
});
