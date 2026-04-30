import { defineTarget, manualSetup, exec } from '@profullstack/sh1pt-core';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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
  async build(ctx, config) {
    const pkgDir = config.packageDir ? join(ctx.projectDir, config.packageDir) : ctx.projectDir;
    ctx.log(`npm pack in ${pkgDir}`);
    await exec('npm', ['pack', '--pack-destination', ctx.outDir], {
      cwd: pkgDir,
      log: ctx.log,
      throwOnNonZero: true,
    });
    return { artifact: `${ctx.outDir}/package.tgz` };
  },
  async ship(ctx, config) {
    const tag = config.tag ?? (ctx.channel === 'stable' ? 'latest' : ctx.channel);
    const registry = config.registry ?? 'https://registry.npmjs.org';
    ctx.log(`npm publish --tag ${tag} --access ${config.access ?? 'public'} → ${registry}`);
    if (ctx.dryRun) return { id: 'dry-run' };

    const token = ctx.secret('NPM_TOKEN');
    if (!token) throw new Error('NPM_TOKEN secret not set. Run: sh1pt secret set NPM_TOKEN <token>');

    const pkgDir = config.packageDir
      ? join(ctx.projectDir, config.packageDir)
      : ctx.projectDir;

    // Write temporary .npmrc with auth for the target registry
    const registryHost = new URL(registry).host;
    const npmrc = `//${registryHost}/:_authToken=${token}\n`;
    await writeFile(join(pkgDir, '.npmrc'), npmrc, 'utf-8');

    const access = config.access ?? 'public';
    await exec('npm', ['publish', `--registry=${registry}`, `--tag=${tag}`, `--access=${access}`], {
      cwd: pkgDir,
      log: ctx.log,
      throwOnNonZero: true,
    });

    return { id: `${ctx.version}@${tag}`, url: `https://www.npmjs.com/package/${ctx.version}` };
  },
  async status(id) {
    return { state: 'live', version: id };
  },

  setup: manualSetup({
    label: "npm registry",
    vendorDocUrl: "https://www.npmjs.com/settings/<user>/tokens",
    steps: [
      "Open npmjs.com → Account → Access Tokens → Generate New Token → Automation",
      "Run: sh1pt secret set NPM_TOKEN <token>",
    ],
  }),
});
