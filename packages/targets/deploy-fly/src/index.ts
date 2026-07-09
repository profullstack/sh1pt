import { defineTarget, manualSetup, exec } from '@profullstack/sh1pt-core';

interface Config {
  app: string;
  regions?: string[];
  strategy?: 'rolling' | 'canary' | 'bluegreen' | 'immediate';
  dockerfile?: string;
}

const STRATEGIES = ['rolling', 'canary', 'bluegreen', 'immediate'] as const;

function deployStrategy(ctx: { channel: string }, config: Config): NonNullable<Config['strategy']> {
  const selectedStrategy = config.strategy ?? (ctx.channel === 'stable' ? 'rolling' : 'canary');
  if (STRATEGIES.includes(selectedStrategy as (typeof STRATEGIES)[number])) {
    return selectedStrategy as NonNullable<Config['strategy']>;
  }
  throw new Error(`deploy-fly strategy must be one of: ${STRATEGIES.join(', ')}`);
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
    const strategy = deployStrategy(ctx, config);
    ctx.log(`flyctl deploy · app=${config.app} · strategy=${strategy}`);

    if (ctx.dryRun) return { id: 'dry-run' };

    // Check required API token
    const token = ctx.secret('FLY_API_TOKEN');
    if (!token) {
      throw new Error(
        'FLY_API_TOKEN is required for deployment. ' +
        'Generate a deploy token via: flyctl tokens create deploy, ' +
        'then set it: sh1pt secret set FLY_API_TOKEN <token>'
      );
    }

    // Build flyctl arguments
    const args: string[] = [
      'deploy',
      '--remote-only',
      '--strategy', strategy,
      '--app', config.app,
    ];

    // Add regions if specified
    if (config.regions && config.regions.length > 0) {
      for (const region of config.regions) {
        args.push('--region', region);
      }
    }

    // Add dockerfile if specified
    if (config.dockerfile) {
      args.push('--dockerfile', config.dockerfile);
    }

    // Execute flyctl deploy
    const { stdout } = await exec('flyctl', args, {
      log: ctx.log,
      throwOnNonZero: true,
    });

    // Parse deploy URL from output — flyctl typically prints something like:
    // "Visit your app at: https://<app>.fly.dev"
    const urlMatch = stdout.match(/https:\/\/[a-zA-Z0-9.-]+\.fly\.dev/);
    const url = urlMatch?.[0] ?? `https://${config.app}.fly.dev`;

    // Extract deployment ID — flyctl often prints a "Deployment #<id>" or
    // "v<version> deployed" line. Fall back to app@version.
    const deployIdMatch = stdout.match(/Deployment\s+#?([a-zA-Z0-9-]+)/i);
    const versionMatch = stdout.match(/v(\d+)\s+deployed/i);
    const id = deployIdMatch?.[1] ?? (versionMatch ? `${config.app}@v${versionMatch[1]}` : `${config.app}@${ctx.version}`);

    ctx.log(`flyctl deploy complete · id=${id} · url=${url}`);

    return { id, url };
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
