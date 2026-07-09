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

function requireText(value: string | undefined, field: string): string {
  const text = value?.trim();
  if (!text) throw new Error(`deploy-denodeploy requires ${field}`);
  return text;
}

function optionalText(value: string | undefined, field: string): string | undefined {
  return value === undefined ? undefined : requireText(value, field);
}

function requireSlug(value: string | undefined, field: string): string {
  const text = requireText(value, field);
  if (!/^[A-Za-z0-9._-]+$/.test(text)) {
    throw new Error(`deploy-denodeploy ${field} must contain only letters, numbers, dots, underscores, or hyphens`);
  }
  return text;
}

function optionalSlug(value: string | undefined, field: string): string | undefined {
  return value === undefined ? undefined : requireSlug(value, field);
}

function textList(value: string[] | undefined, field: string): string[] | undefined {
  return value?.map((entry, index) => requireText(entry, `${field}[${index}]`));
}

function envVars(value: Record<string, string> | undefined): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  for (const [key, entryValue] of Object.entries(value)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`deploy-denodeploy env "${key}" must be a valid environment variable name`);
    }
    if (typeof entryValue !== 'string') {
      throw new Error(`deploy-denodeploy env "${key}" must be a string`);
    }
  }
  return value;
}

function normalizedConfig(config: Config): Config {
  return {
    ...config,
    project: requireSlug(config.project, 'project'),
    entrypoint: requireText(config.entrypoint, 'entrypoint'),
    org: optionalSlug(config.org, 'org'),
    includeFiles: textList(config.includeFiles, 'includeFiles'),
    excludeFiles: textList(config.excludeFiles, 'excludeFiles'),
    env: envVars(config.env),
    envFiles: textList(config.envFiles, 'envFiles'),
  };
}

function deployArgs(ctx: { channel: string }, config: Config): string[] {
  config = normalizedConfig(config);
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
  config = normalizedConfig(config);
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
    config = normalizedConfig(config);
    const planPath = join(ctx.outDir, 'deno-deploy.json');
    ctx.log(`deployctl plan - project=${config.project} entrypoint=${config.entrypoint}`);
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(planPath, renderPlan(ctx, config), 'utf-8');
    return { artifact: planPath };
  },
  async ship(ctx, config) {
    config = normalizedConfig(config);
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
