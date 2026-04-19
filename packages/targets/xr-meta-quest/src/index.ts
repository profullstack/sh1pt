import { defineTarget } from '@sh1pt/core';

// Meta Horizon Store (formerly Oculus Store) for Quest 2/3/Pro/3S.
// Apps are Android APKs built with Meta's Quest SDK (Unity/Unreal/native).
// App Lab and the main store share the same submission pipeline — the
// store placement is a flag on the submission, not a different target.
interface Config {
  orgId: string;
  appId: string;
  // 'live-in-concept' = App Lab, 'production' = main Horizon Store
  placement: 'live-in-concept' | 'production';
  track: 'alpha' | 'beta' | 'release-channel' | 'live';
}

export default defineTarget<Config>({
  id: 'xr-meta-quest',
  kind: 'xr',
  label: 'Meta Horizon Store (Quest)',
  async build(ctx, config) {
    ctx.log(`gradle :quest:bundleRelease · placement=${config.placement}`);
    // TODO: gradle assembleRelease with Quest manifest flags → signed APK
    return { artifact: `${ctx.outDir}/app-quest.apk` };
  },
  async ship(ctx, config) {
    const track = ctx.channel === 'stable' ? config.track : (ctx.channel as Config['track']);
    ctx.log(`upload to Meta Horizon · app=${config.appId} · track=${track}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: Meta Distribution Endpoint API (ovr-platform-util upload-quest-build)
    return { id: `${config.appId}@${ctx.version}`, url: `https://www.meta.com/experiences/${config.appId}` };
  },
  async status(id) {
    return { state: 'in-review', version: id };
  },
});
