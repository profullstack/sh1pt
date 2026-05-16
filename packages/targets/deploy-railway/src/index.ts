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
    ctx.log('railway up --dry-run · validating config');

    const token = ctx.secret('RAILWAY_TOKEN');
    if (!token) throw new Error('RAILWAY_TOKEN secret not set. Run: sh1pt secret set RAILWAY_TOKEN <token>');

    // Validate config without deploying
    await exec('railway', ['up', '--detach', '--ci'], {
      cwd: ctx.projectDir,
      log: ctx.log,
      throwOnNonZero: false,
      env: { RAILWAY_TOKEN: token },
    });

    return { artifact: ctx.projectDir };
  },
  async ship(ctx, config) {
    const env = config.environment ?? (ctx.channel === 'stable' ? 'production' : 'staging');
    ctx.log(`railway up · service=${config.serviceId} · env=${env}`);
    if (ctx.dryRun) return { id: 'dry-run' };

    const token = ctx.secret('RAILWAY_TOKEN');
    if (!token) {
      throw new Error(
        'RAILWAY_TOKEN is required for deployment. ' +
          'Create a token at railway.app/account/tokens, ' +
          'then set it: sh1pt secret set RAILWAY_TOKEN <token>'
      );
    }

    const args: string[] = [
      'up',
      '--service', config.serviceId,
      '--environment', env,
      '--detach',
    ];

    if (config.detach === false) {
      // Remove --detach if the caller wants to wait for completion
      args.pop();
    }

    const { stdout } = await exec('railway', args, {
      cwd: ctx.projectDir,
      log: ctx.log,
      throwOnNonZero: true,
      env: { RAILWAY_TOKEN: token },
    });

    // Railway CLI prints a deployment URL like:
    // "Deployment live: https://<project>.up.railway.app"
    const urlMatch = stdout.match(/https:\/\/[a-zA-Z0-9.-]+\.up\.railway\.app/);
    const url = urlMatch?.[0];

    const id = `${config.serviceId}@${ctx.version}`;
    ctx.log(`railway up complete · id=${id}${url ? ` · url=${url}` : ''}`);

    return {
      id,
      url,
      meta: { projectId: config.projectId, environment: env },
    };
  },

  setup: manualSetup({
    label: 'Railway',
    vendorDocUrl: 'https://railway.app/account/tokens',
    steps: [
      'Open railway.app/account/tokens → Create New Token',
      'Run: sh1pt secret set RAILWAY_TOKEN <token>',
    ],
  }),
});
