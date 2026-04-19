import { defineTarget } from '@sh1pt/core';

interface Config {
  dir: string;                 // built output directory
  provider: 'cloudflare-pages' | 'netlify' | 's3-cloudfront' | 'vercel';
  project?: string;
  domain?: string;
}

export default defineTarget<Config>({
  id: 'web-static',
  kind: 'web',
  label: 'Static web (CDN)',
  async build(ctx, config) {
    ctx.log(`assume prebuilt site in ${config.dir}`);
    // TODO: optionally run a user-defined build command; copy dir into ctx.outDir
    return { artifact: config.dir };
  },
  async ship(ctx, config) {
    ctx.log(`deploy to ${config.provider}${config.project ? `/${config.project}` : ''}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: dispatch to per-provider deploy (wrangler / netlify / s3 sync / vercel)
    return {
      id: `${config.provider}:${ctx.version}`,
      url: config.domain ? `https://${config.domain}` : undefined,
    };
  },
});
