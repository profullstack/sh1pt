import { defineTarget } from '@sh1pt/core';

interface Config {
  name: string;                          // worker name
  accountId: string;
  routes?: string[];                     // custom routes
  // 'production' | 'preview' env from wrangler.toml
  env?: string;
  compatibilityDate?: string;
}

export default defineTarget<Config>({
  id: 'deploy-workers',
  kind: 'web',
  label: 'Cloudflare Workers',
  async build(ctx) {
    ctx.log(`wrangler deploy --dry-run`);
    return { artifact: `${ctx.outDir}/worker-bundle` };
  },
  async ship(ctx, config) {
    const env = config.env ?? (ctx.channel === 'stable' ? 'production' : 'preview');
    ctx.log(`wrangler deploy · name=${config.name} · env=${env}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: `wrangler deploy --env ${env}` with CF_API_TOKEN
    return {
      id: `${config.name}@${ctx.version}`,
      url: `https://${config.name}.${config.accountId}.workers.dev`,
    };
  },
});
