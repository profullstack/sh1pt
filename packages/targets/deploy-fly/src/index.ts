import { defineTarget, manualSetup, exec } from '@profullstack/sh1pt-core';

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

    const token = ctx.secret('FLY_API_TOKEN');
    if (!token) throw new Error('FLY_API_TOKEN secret not set. Run: sh1pt secret set FLY_API_TOKEN <token>');

    const args: string[] = ['deploy', '--build-only', '--app', config.app];
    if (config.dockerfile) args.push('--dockerfile', config.dockerfile);

    await exec('flyctl', args, {
      cwd: ctx.projectDir,
      log: ctx.log,
      throwOnNonZero: true,
      env: { FLY_API_TOKEN: token },
    });

    return { artifact: `${ctx.outDir}/fly-image` };
  },
  async ship(ctx, config) {
    const strategy = config.strategy ?? (ctx.channel === 'stable' ? 'rolling' : 'canary');
    ctx.log(`flyctl deploy · app=${config.app} · strategy=${strategy}`);
    if (ctx.dryRun) return { id: 'dry-run' };

    const token = ctx.secret('FLY_API_TOKEN');
    if (!token) {
      throw new Error(
        'FLY_API_TOKEN is required for deployment. ' +
          'Generate a deploy token via: flyctl tokens create deploy, ' +
          'then set it: sh1pt secret set FLY_API_TOKEN <token>'
      );
    }

    const args: string[] = ['deploy', '--remote-only', '--strategy', strategy, '--app', config.app];

    if (config.regions && config.regions.length > 0) {
      for (const region of config.regions) {
        args.push('--region', region);
      }
    }

    if (config.dockerfile) args.push('--dockerfile', config.dockerfile);

    const { stdout } = await exec('flyctl', args, {
      cwd: ctx.projectDir,
      log: ctx.log,
      throwOnNonZero: true,
      env: { FLY_API_TOKEN: token },
    });

    // Parse deployed URL from flyctl output (e.g. "Visit your app at: https://<app>.fly.dev")
    const urlMatch = stdout.match(/https:\/\/[a-zA-Z0-9.-]+\.fly\.dev/);
    const url = urlMatch?.[0] ?? `https://${config.app}.fly.dev`;

    // Extract deployment version if available (e.g. "v12 deployed")
    const versionMatch = stdout.match(/v(\d+)\s+deployed/i);
    const id = versionMatch ? `${config.app}@v${versionMatch[1]}` : `${config.app}@${ctx.version}`;

    ctx.log(`flyctl deploy complete · id=${id} · url=${url}`);
    return { id, url };
  },

  setup: manualSetup({
    label: 'Fly.io',
    vendorDocUrl: 'https://fly.io/user/personal_access_tokens',
    steps: [
      'Install flyctl from the official docs',
      'Run: flyctl auth login',
      'Generate a deploy token: flyctl tokens create deploy',
      'Run: sh1pt secret set FLY_API_TOKEN <token>',
    ],
  }),
});
