import { defineTarget, exec, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

interface Config {
  appId: string;
  platform?: 'ios' | 'android' | 'all';
  profile?: string;
  submit?: boolean;
  projectDir?: string;
}

function resolvedProjectDir(ctx: { projectDir: string }, config: Config): string {
  if (!config.projectDir) return ctx.projectDir;
  return isAbsolute(config.projectDir) ? config.projectDir : join(ctx.projectDir, config.projectDir);
}

function profileFor(ctx: { channel: string }, config: Config): string {
  return config.profile ?? (ctx.channel === 'stable' ? 'production' : 'preview');
}

function platformFor(config: Config): 'ios' | 'android' | 'all' {
  return config.platform ?? 'all';
}

function buildArgs(ctx: { channel: string }, config: Config): string[] {
  return ['build', '--platform', platformFor(config), '--profile', profileFor(ctx, config), '--non-interactive', '--json'];
}

function shipArgs(ctx: { channel: string }, config: Config): string[] {
  if (config.submit) {
    return ['submit', '--platform', platformFor(config), '--profile', profileFor(ctx, config), '--non-interactive', '--json'];
  }
  return ['update', '--channel', ctx.channel, '--non-interactive', '--json'];
}

function renderPlan(ctx: { channel: string; projectDir: string; version: string }, config: Config): string {
  const command = ['eas', ...buildArgs(ctx, config)];
  return `${JSON.stringify({
    provider: 'expo-eas',
    appId: config.appId,
    version: ctx.version,
    projectDir: resolvedProjectDir(ctx, config),
    platform: platformFor(config),
    profile: profileFor(ctx, config),
    channel: ctx.channel,
    command,
  }, null, 2)}\n`;
}

function parseEasBuild(stdout: string): { id?: string; url?: string } {
  try {
    const data = JSON.parse(stdout) as unknown;
    const builds = Array.isArray(data) ? data : [data];
    const first = builds.find((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'));
    if (!first) return {};
    return {
      id: typeof first.id === 'string' ? first.id : undefined,
      url: typeof first.buildUrl === 'string'
        ? first.buildUrl
        : typeof first.url === 'string'
          ? first.url
          : undefined,
    };
  } catch {
    return {};
  }
}

export default defineTarget<Config>({
  id: 'mobile-expo',
  kind: 'mobile',
  label: 'Expo / EAS',
  async build(ctx, config) {
    const planPath = join(ctx.outDir, 'expo-eas-build.json');
    ctx.log(`eas build --platform ${platformFor(config)} --profile ${profileFor(ctx, config)}`);

    if (ctx.dryRun) {
      await mkdir(ctx.outDir, { recursive: true });
      await writeFile(planPath, renderPlan(ctx, config), 'utf-8');
      return { artifact: planPath };
    }

    const token = ctx.secret('EXPO_TOKEN');
    if (!token) {
      throw new Error('EXPO_TOKEN not in vault — run: sh1pt secret set EXPO_TOKEN <token>');
    }

    const result = await exec('eas', buildArgs(ctx, config), {
      cwd: resolvedProjectDir(ctx, config),
      env: { ...ctx.env, EXPO_TOKEN: token },
      log: ctx.log,
      throwOnNonZero: true,
    });
    const build = parseEasBuild(result.stdout);
    return {
      artifact: build.url ?? planPath,
      meta: { buildId: build.id, command: ['eas', ...buildArgs(ctx, config)] },
    };
  },
  async ship(ctx, config) {
    const command = ['eas', ...shipArgs(ctx, config)];
    ctx.log(config.submit
      ? `eas submit --platform ${platformFor(config)} --profile ${profileFor(ctx, config)}`
      : `eas update --channel ${ctx.channel}`);
    if (ctx.dryRun) return { id: 'dry-run', meta: { command, projectDir: resolvedProjectDir(ctx, config) } };

    const token = ctx.secret('EXPO_TOKEN');
    if (!token) {
      throw new Error('EXPO_TOKEN not in vault — run: sh1pt secret set EXPO_TOKEN <token>');
    }

    await exec('eas', shipArgs(ctx, config), {
      cwd: resolvedProjectDir(ctx, config),
      env: { ...ctx.env, EXPO_TOKEN: token },
      log: ctx.log,
      throwOnNonZero: true,
    });
    return { id: `${config.appId}@${ctx.version}`, url: `https://expo.dev/accounts/${config.appId}` };
  },
  setup: manualSetup({
    label: 'Expo and EAS CLI',
    vendorDocUrl: 'https://docs.expo.dev/eas/cli/',
    steps: [
      'Install Expo CLI with mise: mise use npm:expo',
      'Install EAS CLI with mise: mise use npm:eas-cli',
      'Authenticate: eas login',
      'For CI: sh1pt secret set EXPO_TOKEN <token>',
    ],
  }),
});
