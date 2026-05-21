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

function workerEntry(ctx: { projectDir: string }, config: Config): string | undefined {
  if (!config.entrypoint) return undefined;
  return isAbsolute(config.entrypoint) ? config.entrypoint : join(ctx.projectDir, config.entrypoint);
}

function wranglerConfig(ctx: { projectDir: string }, config: Config): string | undefined {
  if (!config.configPath) return undefined;
  return isAbsolute(config.configPath) ? config.configPath : join(ctx.projectDir, config.configPath);
}

function deployEnv(ctx: { channel: string }, config: Config): string {
  return config.env ?? (ctx.channel === 'stable' ? 'production' : 'preview');
}

function deployArgs(ctx: { channel: string; projectDir: string }, config: Config, opts: { dryRun?: boolean } = {}): string[] {
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
    const planPath = join(ctx.outDir, 'workers-deploy.json');
    ctx.log(`wrangler deploy --dry-run - name=${config.name}`);
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(planPath, renderPlan(ctx, config), 'utf-8');
    return { artifact: planPath };
  },
  async ship(ctx, config) {
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
