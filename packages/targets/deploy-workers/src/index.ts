import { defineTarget, exec, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

interface Config {
  name: string;
  accountId: string;
  routes?: string[];
  env?: string;
  compatibilityDate?: string;
  entrypoint?: string;
  configPath?: string;
  vars?: Record<string, string>;
}

function requireText(value: string | undefined, field: string): string {
  const text = value?.trim();
  if (!text) throw new Error(`deploy-workers requires ${field}`);
  return text;
}

function optionalText(value: string | undefined, field: string): string | undefined {
  return value === undefined ? undefined : requireText(value, field);
}

function requireSegment(value: string | undefined, field: string): string {
  const text = requireText(value, field);
  if (/[\\/?#\s\x00-\x1F\x7F]/.test(text)) {
    throw new Error(`deploy-workers ${field} must be a single URL-safe segment`);
  }
  return text;
}

function compatibilityDate(value: string | undefined): string | undefined {
  const date = optionalText(value, 'compatibilityDate');
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('deploy-workers compatibilityDate must use YYYY-MM-DD');
  }
  return date;
}

function routes(value: string[] | undefined): string[] | undefined {
  return value?.map((route, index) => requireText(route, `routes[${index}]`));
}

function workerVars(value: Record<string, string> | undefined): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  for (const [key, entryValue] of Object.entries(value)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`deploy-workers var "${key}" must be a valid environment variable name`);
    }
    if (typeof entryValue !== 'string') {
      throw new Error(`deploy-workers var "${key}" must be a string`);
    }
  }
  return value;
}

function normalizedConfig(config: Config): Config {
  return {
    ...config,
    name: requireSegment(config.name, 'name'),
    accountId: requireSegment(config.accountId, 'accountId'),
    routes: routes(config.routes),
    env: optionalText(config.env, 'env'),
    compatibilityDate: compatibilityDate(config.compatibilityDate),
    entrypoint: optionalText(config.entrypoint, 'entrypoint'),
    configPath: optionalText(config.configPath, 'configPath'),
    vars: workerVars(config.vars),
  };
}

function workerEntry(ctx: { projectDir: string }, config: Config): string | undefined {
  config = normalizedConfig(config);
  if (!config.entrypoint) return undefined;
  return isAbsolute(config.entrypoint) ? config.entrypoint : join(ctx.projectDir, config.entrypoint);
}

function wranglerConfig(ctx: { projectDir: string }, config: Config): string | undefined {
  config = normalizedConfig(config);
  if (!config.configPath) return undefined;
  return isAbsolute(config.configPath) ? config.configPath : join(ctx.projectDir, config.configPath);
}

function deployEnv(ctx: { channel: string }, config: Config): string {
  config = normalizedConfig(config);
  return config.env ?? (ctx.channel === 'stable' ? 'production' : 'preview');
}

function deployArgs(ctx: { channel: string; projectDir: string }, config: Config, opts: { dryRun?: boolean } = {}): string[] {
  config = normalizedConfig(config);
  const args = ['--yes', 'wrangler', 'deploy'];
  const entrypoint = workerEntry(ctx, config);
  if (entrypoint) args.push(entrypoint);
  args.push('--name', config.name);
  args.push('--env', deployEnv(ctx, config));
  if (config.accountId) args.push('--account-id', config.accountId);
  if (config.compatibilityDate) args.push('--compatibility-date', config.compatibilityDate);
  const configFile = wranglerConfig(ctx, config);
  if (configFile) args.push('--config', configFile);
  for (const route of config.routes ?? []) args.push('--route', route);
  if (opts.dryRun) args.push('--dry-run');
  return args;
}

function renderPlan(ctx: { channel: string; projectDir: string; version: string }, config: Config): string {
  config = normalizedConfig(config);
  return `${JSON.stringify({
    provider: 'cloudflare-workers',
    name: config.name,
    accountId: config.accountId,
    env: deployEnv(ctx, config),
    routes: config.routes ?? [],
    compatibilityDate: config.compatibilityDate ?? null,
    entrypoint: workerEntry(ctx, config) ?? null,
    configPath: wranglerConfig(ctx, config) ?? null,
    version: ctx.version,
    command: ['npx', ...deployArgs(ctx, config, { dryRun: true })],
  }, null, 2)}\n`;
}

function parseWorkerUrl(stdout: string): string | undefined {
  return stdout.match(/https:\/\/[^\s]+\.workers\.dev[^\s]*/)?.[0]
    ?? stdout.match(/https:\/\/[^\s]+/i)?.[0];
}

export default defineTarget<Config>({
  id: 'deploy-workers',
  kind: 'web',
  label: 'Cloudflare Workers',
  async build(ctx, config) {
    config = normalizedConfig(config);
    const planPath = join(ctx.outDir, 'workers-deploy.json');
    ctx.log(`wrangler deploy --dry-run - name=${config.name}`);
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(planPath, renderPlan(ctx, config), 'utf-8');
    return { artifact: planPath };
  },
  async ship(ctx, config) {
    config = normalizedConfig(config);
    const env = deployEnv(ctx, config);
    ctx.log(`wrangler deploy - name=${config.name} - env=${env}`);
    if (ctx.dryRun) {
      return {
        id: 'dry-run',
        meta: { command: ['npx', ...deployArgs(ctx, config, { dryRun: true })] },
      };
    }

    const token = ctx.secret('CLOUDFLARE_API_TOKEN');
    if (!token) {
      throw new Error('CLOUDFLARE_API_TOKEN not in vault - run: sh1pt secret set CLOUDFLARE_API_TOKEN <token>');
    }

    const result = await exec('npx', deployArgs(ctx, config), {
      cwd: ctx.projectDir,
      env: {
        ...ctx.env,
        CLOUDFLARE_API_TOKEN: token,
        ...(config.vars ?? {}),
      },
      log: ctx.log,
      throwOnNonZero: true,
    });

    return {
      id: `${config.name}@${ctx.version}`,
      url: parseWorkerUrl(result.stdout) ?? `https://${config.name}.${config.accountId}.workers.dev`,
    };
  },

  setup: manualSetup({
    label: 'Cloudflare Workers',
    vendorDocUrl: 'https://developers.cloudflare.com/workers/wrangler/',
    steps: [
      'Install with mise: mise use npm:wrangler',
      'Authenticate locally: wrangler login',
      'Open dash.cloudflare.com -> My Profile -> API Tokens -> Edit Cloudflare Workers template',
      'Scope: Workers Scripts:Edit, Account:Read, Zone:Read',
      'Run: sh1pt secret set CLOUDFLARE_API_TOKEN <token>',
    ],
  }),
});
