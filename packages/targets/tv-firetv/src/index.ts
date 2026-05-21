import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  packageName: string;
  appSku: string;
  apkPath?: string;
  deviceTargeting?: 'firetv-only' | 'firetv-and-phone';
}

const PLAN_FILE = 'firetv-package-plan.json';

function artifactPath(ctx: { outDir: string }, config: Config): string {
  return config.apkPath ?? join(ctx.outDir, 'firetv', `${config.packageName}.apk`);
}

function targeting(config: Config): NonNullable<Config['deviceTargeting']> {
  return config.deviceTargeting ?? 'firetv-only';
}

function buildPlan(ctx: { outDir: string; version: string; channel: string }, config: Config) {
  const artifact = artifactPath(ctx, config);
  const deviceTargeting = targeting(config);
  return {
    packageName: config.packageName,
    appSku: config.appSku,
    version: ctx.version,
    channel: ctx.channel,
    artifact,
    deviceTargeting,
    planFile: join(ctx.outDir, PLAN_FILE),
    manifestChecks: [
      {
        path: 'AndroidManifest.xml',
        requirement: 'uses-feature android:name="android.software.leanback"',
        required: deviceTargeting === 'firetv-only',
      },
      {
        path: 'AndroidManifest.xml',
        requirement: 'category android:name="android.intent.category.LEANBACK_LAUNCHER"',
        required: true,
      },
      {
        path: 'AndroidManifest.xml',
        requirement: 'uses-feature android:name="android.hardware.touchscreen" android:required="false"',
        required: true,
      },
    ],
    commands: [
      './gradlew :app:assembleRelease',
      `amazon-appstore edits.create appSku=${config.appSku}`,
      `amazon-appstore apk.upload artifact=${artifact}`,
      `amazon-appstore targeting.update device=${deviceTargeting}`,
      'amazon-appstore edits.submit',
    ],
  };
}

export default defineTarget<Config>({
  id: 'tv-firetv',
  kind: 'tv',
  label: 'Amazon Appstore (Fire TV / Firestick)',
  async build(ctx, config) {
    const plan = buildPlan(ctx, config);
    ctx.log(`firetv plan ${config.appSku} -> ${plan.deviceTargeting}`);
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(plan.planFile, `${JSON.stringify(plan, null, 2)}\n`, 'utf-8');
    return {
      artifact: plan.artifact,
      meta: {
        planFile: plan.planFile,
        deviceTargeting: plan.deviceTargeting,
        manifestChecks: plan.manifestChecks,
      },
    };
  },
  async ship(ctx, config) {
    const plan = buildPlan(ctx, config);
    ctx.log(`upload to Amazon Appstore sku=${config.appSku}`);
    if (ctx.dryRun) {
      return {
        id: 'dry-run',
        meta: {
          appSku: config.appSku,
          packageName: config.packageName,
          artifact: ctx.artifact,
          deviceTargeting: plan.deviceTargeting,
          commands: plan.commands.slice(1),
        },
      };
    }
    // TODO: Amazon App Submission API (create edit -> upload APK -> submit)
    return {
      id: `${config.appSku}@${ctx.version}`,
      url: `https://www.amazon.com/gp/product/${config.appSku}`,
    };
  },
  async status(id) {
    return { state: 'in-review', version: id };
  },

  setup: manualSetup({
    label: 'Fire TV (Amazon Appstore)',
    vendorDocUrl: 'https://developer.amazon.com/docs/app-submission-api/overview.html',
    steps: [
      'Open developer.amazon.com/apps-and-games and register for the Amazon Appstore.',
      'Generate App Submission API credentials in Account Settings -> Security.',
      'Run: sh1pt secret set AMAZON_APPSTORE_CLIENT_ID <id>',
      'Run: sh1pt secret set AMAZON_APPSTORE_CLIENT_SECRET <secret>',
    ],
  }),
});
