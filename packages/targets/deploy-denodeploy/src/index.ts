import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  project: string;
  entrypoint: string;            // e.g. 'server.ts'
  includeFiles?: string[];
  excludeFiles?: string[];
  prod?: boolean;                // false = preview deployment
}

export default defineTarget<Config>({
  id: 'deploy-denodeploy',
  kind: 'web',
  label: 'Deno Deploy',
  async build(ctx, config) {
    ctx.log(`deployctl check · entrypoint=${config.entrypoint}`);
    return { artifact: ctx.projectDir };
  },
  async ship(ctx, config) {
    const kind = (config.prod ?? ctx.channel === 'stable') ? 'production' : 'preview';
    ctx.log(`deployctl deploy --project=${config.project} --${kind === 'production' ? 'prod' : ''}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: `deployctl deploy` via DENO_DEPLOY_TOKEN
    return {
      id: `${config.project}@${ctx.version}`,
      url: `https://${config.project}.deno.dev`,
    };
  },

  setup: manualSetup({
    label: "Deno Deploy",
    vendorDocUrl: "https://dash.deno.com/account",
    steps: [
      "Open dash.deno.com \u2192 Account \u2192 New Access Token",
      "Run: sh1pt secret set DENO_DEPLOY_TOKEN <token>",
    ],
  }),
});
