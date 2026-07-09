import { defineTarget, exec, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

interface Config {
  siteId?: string;
  dir?: string;
  prod?: boolean;
  message?: string;
}

function requireText(value: string | undefined, field: string): string {
  const text = value?.trim();
  if (!text) throw new Error(`deploy-netlify requires ${field}`);
  return text;
}

function optionalText(value: string | undefined, field: string): string | undefined {
  return value === undefined ? undefined : requireText(value, field);
}

function optionalSiteId(value: string | undefined): string | undefined {
  const id = optionalText(value, 'siteId');
  if (id && /[\\/?#\x00-\x1F\x7F]/.test(id)) {
    throw new Error('deploy-netlify siteId must be a single URL path segment');
  }
  return id;
}

function normalizedConfig(config: Config): Config {
  return {
    ...config,
    siteId: optionalSiteId(config.siteId),
    dir: optionalText(config.dir, 'dir'),
    message: optionalText(config.message, 'message'),
  };
}

function deployDir(ctx: { projectDir: string }, config: Config): string {
  config = normalizedConfig(config);
  if (!config.dir) return ctx.projectDir;
  return isAbsolute(config.dir) ? config.dir : join(ctx.projectDir, config.dir);
}

function deployArgs(ctx: { channel: string; projectDir: string; version: string }, config: Config, token?: string): string[] {
  config = normalizedConfig(config);
  const prod = config.prod ?? ctx.channel === 'stable';
  const args = ['--yes', 'netlify-cli', 'deploy', '--json', '--dir', deployDir(ctx, config)];
  if (prod) args.push('--prod');
  if (config.siteId) args.push('--site', config.siteId);
  if (config.message) args.push('--message', config.message);
  else args.push('--message', `sh1pt ${ctx.version}`);
  if (token) args.push('--auth', token);
  return args;
}

function renderPlan(ctx: { channel: string; projectDir: string; version: string }, config: Config): string {
  config = normalizedConfig(config);
  const prod = config.prod ?? ctx.channel === 'stable';
  return `${JSON.stringify({
    provider: 'netlify',
    siteId: config.siteId ?? null,
    dir: deployDir(ctx, config),
    prod,
    command: ['npx', ...deployArgs(ctx, config)],
  }, null, 2)}\n`;
}

function parseDeploy(stdout: string): { id?: string; url?: string } {
  try {
    const data = JSON.parse(stdout) as Record<string, unknown>;
    return {
      id: typeof data.deploy_id === 'string' ? data.deploy_id : typeof data.id === 'string' ? data.id : undefined,
      url: typeof data.deploy_url === 'string'
        ? data.deploy_url
        : typeof data.ssl_url === 'string'
          ? data.ssl_url
          : typeof data.url === 'string'
            ? data.url
            : undefined,
    };
  } catch {
    return {};
  }
}

export default defineTarget<Config>({
  id: 'deploy-netlify',
  kind: 'web',
  label: 'Netlify',
  async build(ctx, config) {
    const planPath = join(ctx.outDir, 'netlify-deploy.json');
    ctx.log(`netlify build · dir=${config.dir ?? 'default'}`);
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(planPath, renderPlan(ctx, config), 'utf-8');
    return { artifact: planPath };
  },
  async ship(ctx, config) {
    config = normalizedConfig(config);
    const prod = config.prod ?? ctx.channel === 'stable';
    ctx.log(`netlify deploy ${prod ? '--prod' : ''} · site=${config.siteId ?? 'linked'}`);
    if (ctx.dryRun) return { id: 'dry-run', meta: { command: ['npx', ...deployArgs(ctx, config)] } };

    const token = ctx.secret('NETLIFY_AUTH_TOKEN');
    if (!token) {
      throw new Error('NETLIFY_AUTH_TOKEN not in vault — run: sh1pt secret set NETLIFY_AUTH_TOKEN <token>');
    }

    const result = await exec('npx', deployArgs(ctx, config, token), {
      cwd: ctx.projectDir,
      env: { ...ctx.env, NETLIFY_AUTH_TOKEN: token },
      log: ctx.log,
      throwOnNonZero: true,
    });
    const deployed = parseDeploy(result.stdout);
    return {
      id: deployed.id ?? `${config.siteId ?? 'netlify'}@${ctx.version}`,
      url: deployed.url,
    };
  },
  setup: manualSetup({
    label: 'Netlify CLI',
    vendorDocUrl: 'https://docs.netlify.com/cli/get-started/',
    steps: [
      'Install with mise: mise use npm:netlify-cli',
      'Authenticate: netlify login',
      'For CI: sh1pt secret set NETLIFY_AUTH_TOKEN <token>',
      'Link once if needed: netlify link',
    ],
  }),
});
