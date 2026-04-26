import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  serviceId?: string;
  blueprint?: string;
}

export default defineTarget<Config>({
  id: 'deploy-render',
  kind: 'web',
  label: 'Render',
  async build(ctx, config) {
    ctx.log(`render blueprint validate ${config.blueprint ?? 'render.yaml'}`);
    return { artifact: `${ctx.outDir}/render-blueprint` };
  },
  async ship(ctx, config) {
    ctx.log(`render deploys create · service=${config.serviceId ?? 'linked'}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    return { id: `${config.serviceId ?? 'render'}@${ctx.version}` };
  },
  setup: manualSetup({
    label: 'Render CLI',
    vendorDocUrl: 'https://render.com/docs/cli',
    steps: [
      'Install the Render CLI from the official docs',
      'Authenticate: render login',
      'For CI: sh1pt secret set RENDER_API_KEY <token>',
    ],
  }),
});
