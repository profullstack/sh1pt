import { defineTarget, manualSetup, exec } from '@profullstack/sh1pt-core';

interface Config {
  projectId: string;
  serviceId: string;
  environment?: string;          // e.g. 'production' | 'staging'
  detach?: boolean;
}

export default defineTarget<Config>({
  id: 'deploy-railway',
  kind: 'web',
  label: 'Railway',
  async build(ctx) {
    ctx.log(`railway up --dry-run`);
    return { artifact: ctx.projectDir };
  },
  async ship(ctx, config) {
    const env = config.environment ?? (ctx.channel === 'stable' ? 'production' : 'staging');
    ctx.log(`railway up · service=${config.serviceId} · env=${env}`);
    if (ctx.dryRun) return { id: 'dry-run' };

    const token = ctx.secret('RAILWAY_TOKEN');
    if (!token) {
      throw new Error('RAILWAY_TOKEN secret is required — run: sh1pt secret set RAILWAY_TOKEN <token>');
    }

    const args = ['up', '--ci'];
    if (config.serviceId) args.push('--service', config.serviceId);
    if (env) args.push('--environment', env);

    ctx.log(`running: railway ${args.join(' ')}`);
    await exec('railway', args, {
      log: ctx.log,
      throwOnNonZero: true,
      env: { RAILWAY_TOKEN: token },
    });

    return {
      id: `${config.serviceId}@${ctx.version}`,
      meta: { projectId: config.projectId, environment: env },
    };
  },

  setup: manualSetup({
    label: "Railway",
    vendorDocUrl: "https://railway.app/account/tokens",
    steps: [
      "Open railway.app/account/tokens \u2192 Create New Token",
      "Run: sh1pt secret set RAILWAY_TOKEN <token>",
    ],
  }),
});
