import { defineTarget, exec, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

interface Config {
  packageDir?: string;
  packageName?: string;
  tag?: 'latest' | 'beta' | 'next' | string;
  access?: 'public' | 'restricted';
  registry?: string;
  provenance?: boolean;
  ignoreScripts?: boolean;
}

interface AubePackResult {
  filename?: string;
  name?: string;
  version?: string;
}

function packageDir(ctx: { projectDir: string }, config: Config): string {
  if (!config.packageDir) return ctx.projectDir;
  return isAbsolute(config.packageDir) ? config.packageDir : join(ctx.projectDir, config.packageDir);
}

function packArgs(ctx: { outDir: string }, config: Config, opts: { dryRun?: boolean } = {}): string[] {
  const args = ['pack', '--json', '--pack-destination', ctx.outDir];
  if (config.registry) args.push(`--registry=${config.registry}`);
  if (config.ignoreScripts) args.push('--ignore-scripts');
  if (opts.dryRun) args.push('--dry-run');
  return args;
}

function publishArgs(
  ctx: { channel: string },
  config: Config,
  opts: { dryRun?: boolean } = {},
): string[] {
  const tag = config.tag ?? (ctx.channel === 'stable' ? 'latest' : ctx.channel);
  const args = ['publish', '--json', `--tag=${tag}`, `--access=${config.access ?? 'public'}`];
  if (config.registry) args.push(`--registry=${config.registry}`);
  if (config.provenance) args.push('--provenance');
  if (config.ignoreScripts) args.push('--ignore-scripts');
  if (opts.dryRun) args.push('--dry-run');
  return args;
}

function packagePath(name: string): string {
  return name.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function resolvePackedArtifact(outDir: string, stdout: string): string {
  try {
    const parsed = JSON.parse(stdout) as AubePackResult | AubePackResult[];
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    if (first?.filename) {
      return isAbsolute(first.filename) ? first.filename : join(outDir, first.filename);
    }
  } catch {
    // Fall through to a stable fallback name when older Aube versions print text.
  }
  return join(outDir, 'package.tgz');
}

export default defineTarget<Config>({
  id: 'pkg-aube',
  kind: 'package-manager',
  label: 'Aube',
  async build(ctx, config) {
    const cwd = packageDir(ctx, config);
    const args = packArgs(ctx, config, { dryRun: ctx.dryRun });
    ctx.log(`aube ${args.join(' ')} (cwd=${cwd})`);

    if (ctx.dryRun) {
      const planPath = join(ctx.outDir, 'aube-pack-plan.json');
      await mkdir(ctx.outDir, { recursive: true });
      await writeFile(planPath, `${JSON.stringify({ cwd, command: ['aube', ...args] }, null, 2)}\n`, 'utf-8');
      return { artifact: planPath, meta: { command: ['aube', ...args], cwd } };
    }

    const { stdout } = await exec('aube', args, {
      cwd,
      env: ctx.env,
      log: ctx.log,
      throwOnNonZero: true,
    });
    return { artifact: resolvePackedArtifact(ctx.outDir, stdout), meta: { command: ['aube', ...args], cwd } };
  },
  async ship(ctx, config) {
    const tag = config.tag ?? (ctx.channel === 'stable' ? 'latest' : ctx.channel);
    const cwd = packageDir(ctx, config);
    const args = publishArgs(ctx, config, { dryRun: ctx.dryRun });
    ctx.log(`aube ${args.join(' ')} (cwd=${cwd})`);
    if (ctx.dryRun) return { id: 'dry-run', meta: { command: ['aube', ...args], cwd } };

    await exec('aube', args, {
      cwd,
      env: {
        ...ctx.env,
        NPM_TOKEN: ctx.secret('NPM_TOKEN'),
        NODE_AUTH_TOKEN: ctx.secret('NPM_TOKEN'),
      },
      log: ctx.log,
      throwOnNonZero: true,
    });

    const name = config.packageName ?? ctx.version;
    return {
      id: `${name}@${ctx.version}:${tag}`,
      url: config.registry ? undefined : `https://www.npmjs.com/package/${packagePath(name)}`,
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
