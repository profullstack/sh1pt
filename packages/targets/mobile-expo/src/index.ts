import { defineTarget, exec, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Config {
  appId: string;
  platform?: 'ios' | 'android' | 'all';
  profile?: string;
  submit?: boolean;
}

const PLATFORMS = ['ios', 'android', 'all'] as const;

interface EasCommand {
  command: 'eas';
  args: string[];
  cwd: string;
}

interface ExpoBuildPlan {
  provider: 'expo-eas';
  appId: string;
  version: string;
  channel: string;
  platform: 'ios' | 'android' | 'all';
  profile: string;
  projectDir: string;
  build: EasCommand;
  metadataArtifact: string;
}

interface ExpoShipPlan {
  provider: 'expo-eas';
  appId: string;
  version: string;
  channel: string;
  platform: 'ios' | 'android' | 'all';
  profile: string;
  action: 'submit' | 'update';
  projectDir: string;
  command: EasCommand;
}

function platform(config: Config): 'ios' | 'android' | 'all' {
  const selectedPlatform = config.platform ?? 'all';
  if (PLATFORMS.includes(selectedPlatform as (typeof PLATFORMS)[number])) {
    return selectedPlatform as 'ios' | 'android' | 'all';
  }
  throw new Error(`mobile-expo platform must be one of: ${PLATFORMS.join(', ')}`);
}

function profile(ctx: { channel: string }, config: Config): string {
  return config.profile ?? (ctx.channel === 'stable' ? 'production' : 'preview');
}

function safeFileStem(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'expo-app';
}

function buildMetadataPath(ctx: { outDir: string; version: string }, config: Config): string {
  return join(ctx.outDir, `${safeFileStem(config.appId)}-${safeFileStem(ctx.version)}.eas-build.json`);
}

function buildPlan(
  ctx: { projectDir: string; outDir: string; version: string; channel: string },
  config: Config,
): ExpoBuildPlan {
  const selectedPlatform = platform(config);
  const selectedProfile = profile(ctx, config);
  return {
    provider: 'expo-eas',
    appId: config.appId,
    version: ctx.version,
    channel: ctx.channel,
    platform: selectedPlatform,
    profile: selectedProfile,
    projectDir: ctx.projectDir,
    build: {
      command: 'eas',
      args: ['build', '--platform', selectedPlatform, '--profile', selectedProfile, '--non-interactive', '--json'],
      cwd: ctx.projectDir,
    },
    metadataArtifact: buildMetadataPath(ctx, config),
  };
}

function shipPlan(
  ctx: { projectDir: string; version: string; channel: string },
  config: Config,
): ExpoShipPlan {
  const selectedPlatform = platform(config);
  const selectedProfile = profile(ctx, config);
  const action = config.submit ? 'submit' : 'update';
  const args = config.submit
    ? ['submit', '--platform', selectedPlatform, '--profile', selectedProfile, '--non-interactive']
    : ['update', '--channel', ctx.channel, '--non-interactive'];

  return {
    provider: 'expo-eas',
    appId: config.appId,
    version: ctx.version,
    channel: ctx.channel,
    platform: selectedPlatform,
    profile: selectedProfile,
    action,
    projectDir: ctx.projectDir,
    command: {
      command: 'eas',
      args,
      cwd: ctx.projectDir,
    },
  };
}

function expoEnv(ctx: { secret(key: string): string | undefined }): Record<string, string | undefined> {
  return { EXPO_TOKEN: ctx.secret('EXPO_TOKEN') };
}

export default defineTarget<Config>({
  id: 'mobile-expo',
  kind: 'mobile',
  label: 'Expo / EAS',
  async build(ctx, config) {
    const plan = buildPlan(ctx, config);
    ctx.log(`eas build --platform ${plan.platform} --profile ${plan.profile}`);
    await mkdir(ctx.outDir, { recursive: true });

    if (ctx.dryRun) {
      const planPath = join(ctx.outDir, `${safeFileStem(config.appId)}-${safeFileStem(ctx.version)}.eas-plan.json`);
      await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf-8');
      return { artifact: planPath, meta: { command: plan.build, metadataArtifact: plan.metadataArtifact } };
    }

    const result = await exec(plan.build.command, plan.build.args, {
      cwd: plan.build.cwd,
      env: expoEnv(ctx),
      log: ctx.log,
      throwOnNonZero: true,
    });
    await writeFile(plan.metadataArtifact, result.stdout || '{}\n', 'utf-8');
    return { artifact: plan.metadataArtifact };
  },
  async ship(ctx, config) {
    const plan = shipPlan(ctx, config);
    ctx.log(config.submit ? `eas submit --platform ${plan.platform} --profile ${plan.profile}` : `eas update --channel ${ctx.channel}`);
    if (ctx.dryRun) return { id: 'dry-run', meta: { command: plan.command } };
    await exec(plan.command.command, plan.command.args, {
      cwd: plan.command.cwd,
      env: expoEnv(ctx),
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
