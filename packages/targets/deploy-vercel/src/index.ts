import { defineTarget, exec, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

interface Config {
  project?: string;
  org?: string;
  prod?: boolean;
  dir?: string;
}

function requireText(value: string | undefined, field: string): string {
  const text = value?.trim();
  if (!text) throw new Error(`deploy-vercel requires ${field}`);
  return text;
}

function optionalText(value: string | undefined, field: string): string | undefined {
  return value === undefined ? undefined : requireText(value, field);
}

function optionalSlug(value: string | undefined, field: string): string | undefined {
  const slug = optionalText(value, field);
  if (slug && !/^[A-Za-z0-9._-]+$/.test(slug)) {
    throw new Error(`deploy-vercel ${field} must contain only letters, numbers, dots, underscores, or hyphens`);
  }
  return slug;
}

function normalizedConfig(config: Config): Config {
  return {
    ...config,
    project: optionalSlug(config.project, 'project'),
    org: optionalSlug(config.org, 'org'),
    dir: optionalText(config.dir, 'dir'),
  };
}

function deployDir(ctx: { projectDir: string }, config: Config): string {
  config = normalizedConfig(config);
  if (!config.dir) return ctx.projectDir;
  return isAbsolute(config.dir) ? config.dir : join(ctx.projectDir, config.dir);
}

function deployArgs(ctx: { channel: string; projectDir: string }, config: Config, token?: string): string[] {
  config = normalizedConfig(config);
  const prod = config.prod ?? ctx.channel === 'stable';
  const args = ['--yes', 'vercel', 'deploy', deployDir(ctx, config), '--yes'];
  if (prod) args.push('--prod');
  if (config.org) args.push('--scope', config.org);
  if (token) args.push('--token', token);
  return args;
}

function renderPlan(ctx: { channel: string; projectDir: string }, config: Config): string {
  config = normalizedConfig(config);
  const prod = config.prod ?? ctx.channel === 'stable';
  return `${JSON.stringify({
    provider: 'vercel',
    project: config.project ?? null,
    org: config.org ?? null,
    dir: deployDir(ctx, config),
    prod,
    command: ['npx', ...deployArgs(ctx, config)],
  }, null, 2)}\n`;
}

function parseDeployUrl(stdout: string): string | undefined {
  return stdout.match(/https:\/\/[^\s]+\.vercel\.app[^\s]*/)?.[0];
}

export default defineTarget<Config>({
  id: 'deploy-vercel',
  kind: 'web',
  label: 'Vercel',
  async build(ctx, config) {
    const planPath = join(ctx.outDir, 'vercel-deploy.json');
    ctx.log('vercel build');
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(planPath, renderPlan(ctx, config), 'utf-8');
    return { artifact: planPath };
  },
  async ship(ctx, config) {
    config = normalizedConfig(config);
    const prod = config.prod ?? ctx.channel === 'stable';
    ctx.log(`vercel deploy ${prod ? '--prod' : ''} · project=${config.project ?? 'linked'}`);
    if (ctx.dryRun) return { id: 'dry-run', meta: { command: ['npx', ...deployArgs(ctx, config)] } };

    const token = ctx.secret('VERCEL_TOKEN');
    if (!token) {
      throw new Error('VERCEL_TOKEN not in vault — run: sh1pt secret set VERCEL_TOKEN <token>');
    }

    const result = await exec('npx', deployArgs(ctx, config, token), {
      cwd: ctx.projectDir,
      env: { ...ctx.env, VERCEL_TOKEN: token },
      log: ctx.log,
      throwOnNonZero: true,
    });
    return {
      id: `${config.project ?? 'vercel'}@${ctx.version}`,
      url: parseDeployUrl(result.stdout),
    };
  },
  setup: manualSetup({
    label: 'Vercel CLI',
    vendorDocUrl: 'https://vercel.com/docs/cli',
    steps: [
      'Install with mise: mise use npm:vercel',
      'Authenticate: vercel login',
      'For CI: sh1pt secret set VERCEL_TOKEN <token>',
      'Link once if needed: vercel link',
    ],
  }),
});
