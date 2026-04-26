import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  appId: string;
  platform?: 'ios' | 'android' | 'all';
  profile?: string;
  submit?: boolean;
}

export default defineTarget<Config>({
  id: 'mobile-expo',
  kind: 'mobile',
  label: 'Expo / EAS',
  async build(ctx, config) {
    const platform = config.platform ?? 'all';
    const profile = config.profile ?? (ctx.channel === 'stable' ? 'production' : 'preview');
    ctx.log(`eas build --platform ${platform} --profile ${profile}`);
    return { artifact: `${ctx.outDir}/expo-eas-build` };
  },
  async ship(ctx, config) {
    const platform = config.platform ?? 'all';
    const profile = config.profile ?? (ctx.channel === 'stable' ? 'production' : 'preview');
    ctx.log(config.submit ? `eas submit --platform ${platform} --profile ${profile}` : `eas update --channel ${ctx.channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    return { id: `${config.appId}@${ctx.version}`, url: `https://expo.dev/accounts/${config.appId}` };
  },
  setup: manualSetup({
    label: 'Expo and EAS CLI',
    vendorDocUrl: 'https://docs.expo.dev/eas/cli/',
    steps: [
      'Install Expo CLI with mise: mise use npm:expo',
      'Install EAS CLI with mise: mise use npm:eas-cli',
      'Authenticate: eas login',
      'For CI: sh1pt secret set EXPO_TOKEN <token>',
    ],
  }),
});
