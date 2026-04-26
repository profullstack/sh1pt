import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  app: string;
  regions?: string[];
  strategy?: 'rolling' | 'canary' | 'bluegreen' | 'immediate';
  dockerfile?: string;
}

export default defineTarget<Config>({
  id: 'deploy-fly',
  kind: 'web',
  label: 'Fly.io',
  async build(ctx, config) {
    ctx.log(`flyctl deploy --build-only · app=${config.app}`);
    return { artifact: `${ctx.outDir}/fly-image` };
  },
  async ship(ctx, config) {
    const strategy = config.strategy ?? (ctx.channel === 'stable' ? 'rolling' : 'canary');
    ctx.log(`flyctl deploy · app=${config.app} · strategy=${strategy}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: `flyctl deploy --remote-only --strategy=${strategy}` with FLY_API_TOKEN
    return {
      id: `${config.app}@${ctx.version}`,
      url: `https://${config.app}.fly.dev`,
    };
  },

  setup: manualSetup({
    label: "Fly.io",
    vendorDocUrl: "https://fly.io/user/personal_access_tokens",
    steps: [
      "Install flyctl from the official docs",
      "Run: flyctl auth login",
      "Generate a deploy token: flyctl tokens create deploy",
      "Run: sh1pt secret set FLY_API_TOKEN <token>",
    ],
  }),
});
