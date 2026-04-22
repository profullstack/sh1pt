import { defineTarget } from '@profullstack/sh1pt-core';

// GitHub Packages — npm-compatible registry scoped to @<org>. Common
// for internal packages or dual-publish alongside public npm.
interface Config {
  org: string;                   // GitHub org / user; package is @<org>/<name>
  packageDir?: string;
  access?: 'public' | 'restricted';
}

export default defineTarget<Config>({
  id: 'pkg-ghpackages',
  kind: 'sdk',
  label: 'GitHub Packages (npm)',
  async build(ctx) {
    ctx.log(`npm pack`);
    return { artifact: `${ctx.outDir}/package.tgz` };
  },
  async ship(ctx, config) {
    ctx.log(`npm publish --registry=https://npm.pkg.github.com · scope=@${config.org}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: npm publish with .npmrc pointing at npm.pkg.github.com and GH_PACKAGES_TOKEN
    return {
      id: `@${config.org}/${ctx.version}`,
      url: `https://github.com/${config.org}/packages`,
    };
  },
});
