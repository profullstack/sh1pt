import { defineTarget } from '@sh1pt/core';

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
    // TODO: `railway up --service ${serviceId} --environment ${env}` with RAILWAY_TOKEN
    return {
      id: `${config.serviceId}@${ctx.version}`,
      meta: { projectId: config.projectId, environment: env },
    };
  },
});
