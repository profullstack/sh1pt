import { defineTarget, manualSetup, exec } from '@profullstack/sh1pt-core';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Config {
  packageDir?: string;
  tag?: 'latest' | 'beta' | 'next' | string;
  access?: 'public' | 'restricted';
  registry?: string;
}

function packageDir(ctx: { projectDir: string }, config: Config): string {
  return config.packageDir ? join(ctx.projectDir, config.packageDir) : ctx.projectDir;
}

async function packageName(pkgDir: string): Promise<string> {
  const manifest = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf-8')) as { name?: unknown };
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) {
    throw new Error('package.json must contain a package name before npm publish');
  }
  return manifest.name;
}

export default defineTarget<Config>({
  id: 'pkg-npm',
  kind: 'package-manager',
  label: 'npm',
  async build(ctx, config) {
    const pkgDir = packageDir(ctx, config);
    if (ctx.dryRun) return { artifact: `${ctx.outDir}/package.tgz` };
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

    const pkgDir = packageDir(ctx, config);
    const name = await packageName(pkgDir);

    const registryHost = new URL(registry).host;
    await mkdir(ctx.outDir, { recursive: true });
    const npmrcPath = join(ctx.outDir, 'npm-publish.npmrc');
    const npmrc = `//${registryHost}/:_authToken=${token}\n`;
    await writeFile(npmrcPath, npmrc, 'utf-8');

    const access = config.access ?? 'public';
    try {
      await exec('npm', ['publish', `--registry=${registry}`, `--tag=${tag}`, `--access=${access}`], {
        cwd: pkgDir,
        log: ctx.log,
        env: {
          ...ctx.env,
          NPM_CONFIG_USERCONFIG: npmrcPath,
        },
        throwOnNonZero: true,
      });
    } finally {
      await rm(npmrcPath, { force: true });
    }

    return { id: `${name}@${ctx.version}`, url: `https://www.npmjs.com/package/${name}` };
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
