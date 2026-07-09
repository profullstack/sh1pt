import { defineTarget, manualSetup, exec } from '@profullstack/sh1pt-core';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Config {
  packageDir?: string;
  tag?: 'latest' | 'beta' | 'next' | string;
  access?: 'public' | 'restricted';
  registry?: string;
}

function requireText(value: string | undefined, field: string): string {
  const text = value?.trim();
  if (!text) throw new Error(`pkg-npm requires ${field}`);
  return text;
}

function optionalText(value: string | undefined, field: string): string | undefined {
  return value === undefined ? undefined : requireText(value, field);
}

function publishTag(value: string | undefined, channel: string): string {
  const tag = optionalText(value, 'tag') ?? (channel === 'stable' ? 'latest' : channel);
  if (!/^[A-Za-z0-9._-]+$/.test(tag)) {
    throw new Error('pkg-npm tag must contain only letters, numbers, dots, underscores, or hyphens');
  }
  return tag;
}

function publishAccess(value: Config['access']): Config['access'] {
  if (value === undefined) return undefined;
  if (!['public', 'restricted'].includes(value)) throw new Error(`pkg-npm access "${value}" is not supported`);
  return value;
}

function registryUrl(value: string | undefined): string {
  const registry = optionalText(value, 'registry') ?? 'https://registry.npmjs.org';
  let parsed: URL;
  try {
    parsed = new URL(registry);
  } catch {
    throw new Error('pkg-npm registry must be a valid HTTP(S) URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('pkg-npm registry must use HTTP(S)');
  return registry.replace(/\/+$/, '');
}

function normalizedConfig(config: Config): Config {
  return {
    ...config,
    packageDir: optionalText(config.packageDir, 'packageDir'),
    access: publishAccess(config.access),
    registry: registryUrl(config.registry),
  };
}

function packageDir(ctx: { projectDir: string }, config: Config): string {
  config = normalizedConfig(config);
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
    config = normalizedConfig(config);
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
    config = normalizedConfig(config);
    const tag = publishTag(config.tag, ctx.channel);
    const registry = registryUrl(config.registry);
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
