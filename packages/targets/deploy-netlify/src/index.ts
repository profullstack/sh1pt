import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  siteId?: string;
  dir?: string;
  prod?: boolean;
}

export default defineTarget<Config>({
  id: 'deploy-netlify',
  kind: 'web',
  label: 'Netlify',
  async build(ctx, config) {
    ctx.log(`netlify build · dir=${config.dir ?? 'default'}`);
    return { artifact: `${ctx.outDir}/netlify-site` };
  },
  async ship(ctx, config) {
    const prod = config.prod ?? ctx.channel === 'stable';
    ctx.log(`netlify deploy ${prod ? '--prod' : ''} · site=${config.siteId ?? 'linked'}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    return { id: `${config.siteId ?? 'netlify'}@${ctx.version}` };
  },
  setup: manualSetup({
    label: 'Netlify CLI',
    vendorDocUrl: 'https://docs.netlify.com/cli/get-started/',
    steps: [
      'Install with mise: mise use npm:netlify-cli',
      'Authenticate: netlify login',
      'For CI: sh1pt secret set NETLIFY_AUTH_TOKEN <token>',
      'Link once if needed: netlify link',
    ],
  }),
});
