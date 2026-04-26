import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  project?: string;
  org?: string;
  prod?: boolean;
}

export default defineTarget<Config>({
  id: 'deploy-vercel',
  kind: 'web',
  label: 'Vercel',
  async build(ctx) {
    ctx.log('vercel build');
    return { artifact: `${ctx.outDir}/vercel-output` };
  },
  async ship(ctx, config) {
    const prod = config.prod ?? ctx.channel === 'stable';
    ctx.log(`vercel deploy ${prod ? '--prod' : ''} · project=${config.project ?? 'linked'}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    return { id: `${config.project ?? 'vercel'}@${ctx.version}`, url: undefined };
  },
  setup: manualSetup({
    label: 'Vercel CLI',
    vendorDocUrl: 'https://vercel.com/docs/cli',
    steps: [
      'Install with mise: mise use npm:vercel',
      'Authenticate: vercel login',
      'For CI: sh1pt secret set VERCEL_TOKEN <token>',
      'Link once if needed: vercel link',
    ],
  }),
});
