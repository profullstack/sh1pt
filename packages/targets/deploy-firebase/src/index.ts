import { defineTarget, exec, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

interface Config {
  projectId: string;
  only?: string[];
  config?: string;
  message?: string;
}

function requireText(value: string | undefined, field: string): string {
  const text = value?.trim();
  if (!text) throw new Error(`deploy-firebase requires ${field}`);
  return text;
}

function optionalText(value: string | undefined, field: string): string | undefined {
  return value === undefined ? undefined : requireText(value, field);
}

function projectId(value: string | undefined): string {
  const id = requireText(value, 'projectId');
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new Error('deploy-firebase projectId must contain only letters, numbers, dots, underscores, or hyphens');
  }
  return id;
}

function deployTargets(value: string[] | undefined): string[] | undefined {
  return value?.map((target, index) => {
    const text = requireText(target, `only[${index}]`);
    if (text.includes(',')) throw new Error(`deploy-firebase only[${index}] must not contain commas`);
    return text;
  });
}

function normalizedConfig(config: Config): Config {
  return {
    ...config,
    projectId: projectId(config.projectId),
    only: deployTargets(config.only),
    config: optionalText(config.config, 'config'),
    message: optionalText(config.message, 'message'),
  };
}

function configPath(ctx: { projectDir: string }, config: Config): string | undefined {
  config = normalizedConfig(config);
  if (!config.config) return undefined;
  return isAbsolute(config.config) ? config.config : join(ctx.projectDir, config.config);
}

function deployArgs(ctx: { projectDir: string }, config: Config, token?: string): string[] {
  config = normalizedConfig(config);
  const args = ['--yes', 'firebase-tools', 'deploy', '--project', config.projectId, '--json'];
  if (config.only?.length) args.push('--only', config.only.join(','));
  const firebaseConfig = configPath(ctx, config);
  if (firebaseConfig) args.push('--config', firebaseConfig);
  if (config.message) args.push('--message', config.message);
  if (token) args.push('--token', token);
  return args;
}

function renderPlan(ctx: { projectDir: string; version: string }, config: Config): string {
  config = normalizedConfig(config);
  return `${JSON.stringify({
    provider: 'firebase',
    projectId: config.projectId,
    only: config.only ?? [],
    config: configPath(ctx, config) ?? null,
    version: ctx.version,
    command: ['npx', ...deployArgs(ctx, config)],
  }, null, 2)}\n`;
}

function parseDeployUrl(stdout: string, projectId: string): string {
  try {
    const data = JSON.parse(stdout) as { result?: { hosting?: Record<string, unknown> } };
    const hosting = data.result?.hosting;
    const firstSite = hosting ? Object.values(hosting)[0] as { url?: string } | undefined : undefined;
    if (firstSite?.url) return firstSite.url;
  } catch {
    // Keep the stable Firebase Hosting fallback below.
  }
  return `https://${projectId}.web.app`;
}

export default defineTarget<Config>({
  id: 'deploy-firebase',
  kind: 'web',
  label: 'Firebase Hosting / Functions',
  async build(ctx, config) {
    config = normalizedConfig(config);
    const planPath = join(ctx.outDir, 'firebase-deploy.json');
    ctx.log('firebase emulators:exec --only hosting,functions');
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(planPath, renderPlan(ctx, config), 'utf-8');
    return { artifact: planPath };
  },
  async ship(ctx, config) {
    config = normalizedConfig(config);
    const only = config.only?.length ? ` --only ${config.only.join(',')}` : '';
    ctx.log(`firebase deploy --project ${config.projectId}${only}`);
    if (ctx.dryRun) return { id: 'dry-run', meta: { command: ['npx', ...deployArgs(ctx, config)] } };

    const token = ctx.secret('FIREBASE_TOKEN');
    if (!token) {
      throw new Error('FIREBASE_TOKEN not in vault - run: sh1pt secret set FIREBASE_TOKEN <token>');
    }

    const result = await exec('npx', deployArgs(ctx, config, token), {
      cwd: ctx.projectDir,
      env: { ...ctx.env, FIREBASE_TOKEN: token },
      log: ctx.log,
      throwOnNonZero: true,
    });
    return {
      id: `${config.projectId}@${ctx.version}`,
      url: parseDeployUrl(result.stdout, config.projectId),
    };
  },
  setup: manualSetup({
    label: 'Firebase CLI',
    vendorDocUrl: 'https://firebase.google.com/docs/cli',
    steps: [
      'Install with mise: mise use npm:firebase-tools',
      'Authenticate: firebase login',
      'For CI: sh1pt secret set FIREBASE_TOKEN <token>',
    ],
  }),
});
