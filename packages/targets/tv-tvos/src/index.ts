import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  bundleId: string;
  teamId: string;
  scheme?: string;
  testflightGroups?: string[];
  ipaPath?: string;
}

const PLAN_FILE = 'tvos-package-plan.json';

function scheme(config: Config): string {
  return config.scheme ?? 'default';
}

function artifactPath(ctx: { outDir: string }, config: Config): string {
  return config.ipaPath ?? join(ctx.outDir, 'tvos', `${config.bundleId}.ipa`);
}

function destination(channel: string, config: Config): string {
  if (channel === 'stable') return 'app-store';
  const groups = config.testflightGroups?.length ? config.testflightGroups.join(',') : 'internal';
  return `testflight:${groups}`;
}

function buildPlan(ctx: { outDir: string; version: string; channel: string }, config: Config) {
  const artifact = artifactPath(ctx, config);
  const archivePath = join(ctx.outDir, 'tvos', `${config.bundleId}.xcarchive`);
  const exportOptions = join(ctx.outDir, 'tvos', 'ExportOptions.plist');
  return {
    bundleId: config.bundleId,
    teamId: config.teamId,
    version: ctx.version,
    channel: ctx.channel,
    scheme: scheme(config),
    artifact,
    archivePath,
    exportOptions,
    destination: destination(ctx.channel, config),
    planFile: join(ctx.outDir, PLAN_FILE),
    requirements: [
      'macOS runner with Xcode and the tvOS SDK installed',
      'App Store Connect API key, key id, and issuer id in the sh1pt vault',
      'tvOS app record enabled for the bundle id in App Store Connect',
    ],
    commands: [
      `xcodebuild -scheme ${scheme(config)} -sdk appletvos archive -archivePath ${archivePath}`,
      `xcodebuild -exportArchive -archivePath ${archivePath} -exportOptionsPlist ${exportOptions} -exportPath ${join(ctx.outDir, 'tvos')}`,
      `xcrun altool --upload-app --type tvos --file ${artifact}`,
    ],
  };
}

export default defineTarget<Config>({
  id: 'tv-tvos',
  kind: 'tv',
  label: 'App Store (Apple TV / tvOS)',
  async build(ctx, config) {
    const plan = buildPlan(ctx, config);
    ctx.log(`tvos plan ${config.bundleId} scheme=${plan.scheme}`);
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(plan.planFile, `${JSON.stringify(plan, null, 2)}\n`, 'utf-8');
    return {
      artifact: plan.artifact,
      meta: {
        planFile: plan.planFile,
        destination: plan.destination,
        archivePath: plan.archivePath,
      },
    };
  },
  async ship(ctx, config) {
    const plan = buildPlan(ctx, config);
    ctx.log(`upload ${config.bundleId}@${ctx.version} to ${plan.destination} via App Store Connect API`);
    if (ctx.dryRun) {
      return {
        id: 'dry-run',
        meta: {
          bundleId: config.bundleId,
          artifact: ctx.artifact,
          destination: plan.destination,
          commands: plan.commands.slice(2),
        },
      };
    }
    // TODO: upload through App Store Connect API credentials from the vault.
    return { id: `${config.bundleId}@${ctx.version}` };
  },
  async status(id) {
    return { state: 'in-review', version: id };
  },

  setup: manualSetup({
    label: 'Apple TV (tvOS)',
    vendorDocUrl: 'https://developer.apple.com/app-store-connect/api/',
    steps: [
      'Join the Apple Developer Program and enable tvOS for the app in App Store Connect.',
      'Create an App Store Connect API key with app management access.',
      'Run: sh1pt secret set APP_STORE_CONNECT_KEY_ID <key-id>',
      'Run: sh1pt secret set APP_STORE_CONNECT_ISSUER_ID <issuer-id>',
      'Run: sh1pt secret set APP_STORE_CONNECT_KEY <private-key>',
    ],
  }),
});
