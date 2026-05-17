import { defineTarget, exec, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Config {
  project: string;
  entrypoint: string;            // e.g. 'server.ts'
  org?: string;
  includeFiles?: string[];
  excludeFiles?: string[];
  env?: Record<string, string>;
  envFiles?: string[];
  prod?: boolean;                // false = preview deployment
}

function deployArgs(ctx: { channel: string }, config: Config): string[] {
  const prod = config.prod ?? ctx.channel === 'stable';
  const args = [
    'deploy',
    `--project=${config.project}`,
    `--entrypoint=${config.entrypoint}`,
  ];
  if (config.org) args.push(`--org=${config.org}`);
  if (prod) args.push('--prod');
  for (const include of config.includeFiles ?? []) args.push(`--include=${include}`);
  for (const exclude of config.excludeFiles ?? []) args.push(`--exclude=${exclude}`);
  for (const [key, value] of Object.entries(config.env ?? {})) args.push(`--env=${key}=${value}`);
  for (const file of config.envFiles ?? []) args.push(`--env-file=${file}`);
  return args;
}

function renderPlan(ctx: { channel: string; projectDir: string; version: string }, config: Config): string {
  const prod = config.prod ?? ctx.channel === 'stable';
  return `${JSON.stringify({
    provider: 'deno-deploy',
    project: config.project,
    org: config.org ?? null,
    entrypoint: config.entrypoint,
    includeFiles: config.includeFiles ?? [],
    excludeFiles: config.excludeFiles ?? [],
    env: config.env ?? {},
    envFiles: config.envFiles ?? [],
    prod,
    projectDir: ctx.projectDir,
    version: ctx.version,
    command: ['deployctl', ...deployArgs(ctx, config)],
  }, null, 2)}\n`;
}

function parseDeploy(stdout: string, project: string, version: string): { id: string; url: string } {
  try {
    const data = JSON.parse(stdout) as Record<string, unknown>;
    const deployment = typeof data.deployment === 'object' && data.deployment
      ? data.deployment as Record<string, unknown>
      : {};
    const build = typeof data.build === 'object' && data.build
      ? data.build as Record<string, unknown>
      : {};
    const id = typeof data.id === 'string'
      ? data.id
      : typeof deployment.id === 'string'
        ? deployment.id
        : typeof build.deploymentId === 'string'
          ? build.deploymentId
          : `${project}@${version}`;
    const url = typeof data.url === 'string'
      ? data.url
      : typeof deployment.url === 'string'
        ? deployment.url
        : `https://${project}.deno.dev`;
    return { id, url };
  } catch {
    return {
      id: `${project}@${version}`,
      url: stdout.match(/https:\/\/[^\s]+\.deno\.dev[^\s]*/)?.[0] ?? `https://${project}.deno.dev`,
    };
  }
}

export default defineTarget<Config>({
  id: 'deploy-denodeploy',
  kind: 'web',
  label: 'Deno Deploy',
  async build(ctx, config) {
    const planPath = join(ctx.outDir, 'deno-deploy.json');
    ctx.log(`deployctl plan - project=${config.project} entrypoint=${config.entrypoint}`);
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(planPath, renderPlan(ctx, config), 'utf-8');
    return { artifact: planPath };
  },
  async ship(ctx, config) {
    const kind = (config.prod ?? ctx.channel === 'stable') ? 'production' : 'preview';
    ctx.log(`deployctl deploy - project=${config.project} kind=${kind}`);
    if (ctx.dryRun) return { id: 'dry-run', meta: { command: ['deployctl', ...deployArgs(ctx, config)] } };

    const token = ctx.secret('DENO_DEPLOY_TOKEN');
    if (!token) {
      throw new Error('DENO_DEPLOY_TOKEN not in vault - run: sh1pt secret set DENO_DEPLOY_TOKEN <token>');
    }

    const result = await exec('deployctl', deployArgs(ctx, config), {
      cwd: ctx.projectDir,
      env: { ...ctx.env, DENO_DEPLOY_TOKEN: token },
      log: ctx.log,
      throwOnNonZero: true,
    });
    const deployed = parseDeploy(result.stdout, config.project, ctx.version);
    return {
      id: deployed.id,
      url: deployed.url,
    };
  },

  setup: manualSetup({
    label: 'Deno Deploy',
    vendorDocUrl: 'https://docs.deno.com/deploy/classic/deployctl/',
    steps: [
      'Install deployctl: deno install -gArf jsr:@deno/deployctl',
      'Create an access token in the Deno Deploy dashboard',
      'Run: sh1pt secret set DENO_DEPLOY_TOKEN <token>',
    ],
  }),
});
