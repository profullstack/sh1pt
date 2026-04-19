import { defineTarget } from '@sh1pt/core';

interface Config {
  packageDir?: string;
  tag?: 'latest' | 'beta' | 'next' | string;
  access?: 'public' | 'restricted';
  registry?: string;
}

export default defineTarget<Config>({
  id: 'pkg-npm',
  kind: 'package-manager',
  label: 'npm',
  async build(ctx) {
    ctx.log('pack tarball via `npm pack`');
    // TODO: spawn npm pack in ctx.projectDir/config.packageDir → write into ctx.outDir
    return { artifact: `${ctx.outDir}/package.tgz` };
  },
  async ship(ctx, config) {
    const tag = config.tag ?? (ctx.channel === 'stable' ? 'latest' : ctx.channel);
    ctx.log(`npm publish --tag ${tag} --access ${config.access ?? 'public'}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: npm publish with NPM_TOKEN from ctx.secret('NPM_TOKEN')
    return { id: `${ctx.version}@${tag}`, url: `https://www.npmjs.com/package/${ctx.version}` };
  },
  async status(id) {
    return { state: 'live', version: id };
  },
});
