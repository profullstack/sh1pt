import { defineTarget } from '@sh1pt/core';

// SideQuest — third-party Quest sideload distribution. No Meta review,
// used for demos, betas, and NSFW content Meta rejects. Valuable
// shipping channel for early-stage XR projects.
interface Config {
  sidequestAppId?: string;  // assigned after first submission
  developerId: string;
  apkPath?: string;
  visibility: 'unlisted' | 'public';
}

export default defineTarget<Config>({
  id: 'xr-sidequest',
  kind: 'xr',
  label: 'SideQuest (Quest sideload)',
  async build(ctx, config) {
    ctx.log(`reuse Quest APK${config.apkPath ? ` from ${config.apkPath}` : ''}`);
    return { artifact: config.apkPath ?? `${ctx.outDir}/app-quest.apk` };
  },
  async ship(ctx, config) {
    ctx.log(`upload to SideQuest · visibility=${config.visibility}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: SideQuest API (create app / create version / upload APK)
    return {
      id: `${config.sidequestAppId ?? 'pending'}@${ctx.version}`,
      url: config.sidequestAppId ? `https://sidequestvr.com/app/${config.sidequestAppId}` : undefined,
    };
  },
});
