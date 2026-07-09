import { defineTarget, manualSetup, exec } from '@profullstack/sh1pt-core';

interface Config {
  projectId: string;
  serviceId: string;
  environment?: string;          // e.g. 'production' | 'staging'
  detach?: boolean;
}

function requireText(value: string | undefined, field: string): string {
  const text = value?.trim();
  if (!text) throw new Error(`deploy-railway requires ${field}`);
  return text;
}

function requireSegment(value: string | undefined, field: string): string {
  const text = requireText(value, field);
  if (/[\\/?#\x00-\x1F\x7F]/.test(text)) {
    throw new Error(`deploy-railway ${field} must be a single URL path segment`);
  }
  return text;
}

function environmentName(config: Config, channel: string): string {
  const env = config.environment === undefined
    ? (channel === 'stable' ? 'production' : 'staging')
    : requireText(config.environment, 'environment');
  if (!/^[A-Za-z0-9._-]+$/.test(env)) {
    throw new Error('deploy-railway environment must contain only letters, numbers, dots, underscores, or hyphens');
  }
  return env;
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
    config = {
      ...config,
      projectId: requireSegment(config.projectId, 'projectId'),
      serviceId: requireSegment(config.serviceId, 'serviceId'),
      environment: environmentName(config, ctx.channel),
    };
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
