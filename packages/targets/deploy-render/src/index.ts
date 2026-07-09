import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

interface Config {
  serviceId?: string;
  blueprint?: string;
  deployHookUrl?: string;
  waitForDeploy?: boolean;
}

interface RenderDeployResponse {
  id?: string;
  deploy?: { id?: string };
}

function requireText(value: string | undefined, field: string): string {
  const text = value?.trim();
  if (!text) throw new Error(`deploy-render requires ${field}`);
  return text;
}

function optionalText(value: string | undefined, field: string): string | undefined {
  return value === undefined ? undefined : requireText(value, field);
}

function serviceId(config: Config): string | undefined {
  const id = optionalText(config.serviceId, 'serviceId');
  if (id && /[\\/?#\x00-\x1F\x7F]/.test(id)) {
    throw new Error('deploy-render serviceId must be a single URL path segment');
  }
  return id;
}

function deployHookUrl(config: Config): string | undefined {
  const url = optionalText(config.deployHookUrl, 'deployHookUrl');
  if (!url) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('deploy-render deployHookUrl must be a valid HTTPS URL');
  }
  if (parsed.protocol !== 'https:') throw new Error('deploy-render deployHookUrl must use HTTPS');
  return url;
}

function blueprintPath(ctx: { projectDir: string }, config: Config): string {
  const blueprint = optionalText(config.blueprint, 'blueprint') ?? 'render.yaml';
  return isAbsolute(blueprint) ? blueprint : join(ctx.projectDir, blueprint);
}

function renderPlan(ctx: { projectDir: string; version: string }, config: Config): string {
  const id = serviceId(config);
  const hookUrl = deployHookUrl(config);
  return `${JSON.stringify({
    provider: 'render',
    serviceId: id ?? null,
    blueprint: blueprintPath(ctx, config),
    trigger: hookUrl ? 'deploy-hook' : 'api',
    waitForDeploy: config.waitForDeploy ?? false,
    version: ctx.version,
  }, null, 2)}\n`;
}

async function blueprintExists(path: string): Promise<boolean> {
  try {
    await readFile(path, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

async function triggerDeployHook(url: string): Promise<string> {
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`Render deploy hook failed (${res.status})`);
  return `deploy-hook-${Date.now()}`;
}

async function createDeploy(ctx: { secret(key: string): string | undefined; version: string }, config: Config): Promise<string> {
  const id = serviceId(config);
  if (!id) throw new Error('Render serviceId is required for API deploys');
  const token = ctx.secret('RENDER_API_KEY');
  if (!token) throw new Error('RENDER_API_KEY not in vault — run: sh1pt secret set RENDER_API_KEY <token>');

  const res = await fetch(`https://api.render.com/v1/services/${id}/deploys`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  const data = await res.json().catch(() => ({})) as RenderDeployResponse;
  if (!res.ok) throw new Error(`Render deploy failed (${res.status})`);
  return data.deploy?.id ?? data.id ?? `${id}@${ctx.version}`;
}

export default defineTarget<Config>({
  id: 'deploy-render',
  kind: 'web',
  label: 'Render',
  async build(ctx, config) {
    const planPath = join(ctx.outDir, 'render-deploy.json');
    const blueprint = blueprintPath(ctx, config);
    ctx.log(`render blueprint validate ${config.blueprint ?? 'render.yaml'}`);
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(planPath, renderPlan(ctx, config), 'utf-8');
    if (!(await blueprintExists(blueprint))) {
      ctx.log(`Render blueprint not found at ${blueprint}; continuing with deploy plan only`, 'warn');
    }
    return { artifact: planPath };
  },
  async ship(ctx, config) {
    config = {
      ...config,
      serviceId: serviceId(config),
      deployHookUrl: deployHookUrl(config),
    };
    ctx.log(`render deploys create · service=${config.serviceId ?? 'linked'}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    const id = config.deployHookUrl
      ? await triggerDeployHook(config.deployHookUrl)
      : await createDeploy(ctx, config);
    return {
      id,
      url: config.serviceId ? `https://dashboard.render.com/web/${config.serviceId}` : undefined,
    };
  },
  setup: manualSetup({
    label: 'Render CLI',
    vendorDocUrl: 'https://render.com/docs/cli',
    steps: [
      'Install the Render CLI from the official docs',
      'Authenticate: render login',
      'For CI: sh1pt secret set RENDER_API_KEY <token>',
    ],
  }),
});
