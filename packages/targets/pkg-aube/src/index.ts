import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  packageDir?: string;
  packageName?: string;
  tag?: 'latest' | 'beta' | 'next' | string;
  access?: 'public' | 'restricted';
  registry?: string;
  provenance?: boolean;
}

export default defineTarget<Config>({
  id: 'pkg-aube',
  kind: 'package-manager',
  label: 'Aube',
  async build(ctx, config) {
    const destination = config.packageDir ?? ctx.projectDir;
    ctx.log(`aube pack --pack-destination ${ctx.outDir} (cwd=${destination})`);
    // TODO: spawn `aube pack --pack-destination <outDir>` in ctx.projectDir/config.packageDir.
    return { artifact: `${ctx.outDir}/package.tgz` };
  },
  async ship(ctx, config) {
    const tag = config.tag ?? (ctx.channel === 'stable' ? 'latest' : ctx.channel);
    const registry = config.registry ? ` (registry=${config.registry})` : '';
    const provenance = config.provenance ? ' --provenance' : '';
    ctx.log(`aube publish --tag ${tag} --access ${config.access ?? 'public'}${provenance}${registry}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: aube reads npm-compatible auth from .npmrc/NPM_TOKEN; run publish in packageDir.
    const name = config.packageName ?? ctx.version;
    const packagePath = name.split('/').map((segment) => encodeURIComponent(segment)).join('/');
    return {
      id: `${name}@${ctx.version}:${tag}`,
      url: config.registry ? undefined : `https://www.npmjs.com/package/${packagePath}`,
    };
  },
  async status(id) {
    return { state: 'live', version: id };
  },

  setup: manualSetup({
    label: "Aube",
    vendorDocUrl: "https://aube.en.dev/package-manager/publishing.html",
    steps: [
      "Install Aube: mise use -g aube, brew install endevco/tap/aube, or npm install -g @endevco/aube",
      "Configure npm-compatible registry auth in .npmrc, or run: sh1pt secret set NPM_TOKEN <token>",
      "Use pkg-aube when you want sh1pt to pack and publish through `aube publish`",
    ],
  }),
});
