import { defineTarget, manualSetup, exec } from '@profullstack/sh1pt-core';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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
  async build(ctx, config) {
    const pkgDir = config.packageDir ? join(ctx.projectDir, config.packageDir) : ctx.projectDir;
    ctx.log(`npm pack in ${pkgDir}`);
    await exec('npm', ['pack', '--pack-destination', ctx.outDir], {
      cwd: pkgDir,
      log: ctx.log,
    });
    return { artifact: `${ctx.outDir}/package.tgz` };
  },
  async ship(ctx, config) {
    ctx.log(`npm publish --registry=https://npm.pkg.github.com · scope=@${config.org}`);
    if (ctx.dryRun) return { id: 'dry-run' };

    const token = ctx.secret('GH_PACKAGES_TOKEN');
    if (!token) throw new Error('GH_PACKAGES_TOKEN secret not set. Run: sh1pt secret set GH_PACKAGES_TOKEN <token>');

    const pkgDir = config.packageDir
      ? join(ctx.projectDir, config.packageDir)
      : ctx.projectDir;

    // Write temporary .npmrc with GitHub Packages auth
    const npmrc = [
      `//npm.pkg.github.com/:_authToken=${token}`,
      `@${config.org}:registry=https://npm.pkg.github.com/`,
      '',
    ].join('\n');
    await writeFile(join(pkgDir, '.npmrc'), npmrc, 'utf-8');

    const access = config.access ?? 'public';
    await exec('npm', ['publish', '--registry=https://npm.pkg.github.com', `--access=${access}`], {
      cwd: pkgDir,
      log: ctx.log,
    });

    return {
      id: `@${config.org}/${ctx.version}`,
      url: `https://github.com/${config.org}/packages`,
    };
  },

  setup: manualSetup({
    label: "GitHub Packages (npm)",
    vendorDocUrl: "https://github.com/settings/tokens",
    steps: [
      "Generate a fine-grained PAT with write:packages permission",
      "Run: sh1pt secret set GH_PACKAGES_TOKEN <token>",
    ],
  }),
});
