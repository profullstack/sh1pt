import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  packageName: string;
  appSku: string;
  apkPath?: string;
  deviceTargeting?: 'phone-only' | 'phone-and-tablet';
}

const PLAN_FILE = 'amazon-appstore-package-plan.json';

function artifactPath(ctx: { outDir: string }, config: Config): string {
  return config.apkPath ?? join(ctx.outDir, 'amazon', `${config.packageName}.apk`);
}

function targeting(config: Config): NonNullable<Config['deviceTargeting']> {
  return config.deviceTargeting ?? 'phone-and-tablet';
}

function buildPlan(ctx: { outDir: string; version: string; channel: string }, config: Config, artifactOverride?: string) {
  const artifact = artifactOverride ?? artifactPath(ctx, config);
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
        requirement: 'category android:name="android.intent.category.LAUNCHER"',
        required: true,
      },
      {
        path: 'AndroidManifest.xml',
        requirement: 'uses-feature android:name="android.hardware.touchscreen" android:required="true"',
        required: true,
      },
      {
        // Amazon rejects APKs that hard-require Google Play Services on the
        // generic phone/tablet track — surface it as a check, not a silent fail.
        path: 'AndroidManifest.xml',
        requirement: 'no hard dependency on com.google.android.gms (Play Services)',
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
  id: 'mobile-amazon',
  kind: 'mobile',
  label: 'Amazon Appstore (Android phones & tablets)',
  async build(ctx, config) {
    const plan = buildPlan(ctx, config);
    ctx.log(`amazon plan ${config.appSku} -> ${plan.deviceTargeting}`);
    await mkdir(ctx.outDir, { recursive: true });
    // Ensure the artifact's directory exists (e.g. <outDir>/amazon/) so the
    // downstream APK build can write to the reported artifact path.
    await mkdir(dirname(plan.artifact), { recursive: true });
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
    // Build the plan against the artifact actually handed to ship() so the
    // upload command and the reported artifact can't diverge when apkPath is
    // omitted and ship's outDir differs from build's.
    const plan = buildPlan(ctx, config, ctx.artifact);
    ctx.log(`upload to Amazon Appstore sku=${config.appSku}`);
    if (ctx.dryRun) {
      return {
        id: 'dry-run',
        meta: {
          appSku: config.appSku,
          packageName: config.packageName,
          artifact: plan.artifact,
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
    label: 'Amazon Appstore (Android) — App Submission API, shared with tv-firetv',
    vendorDocUrl: 'https://developer.amazon.com/docs/app-submission-api/overview.html',
    steps: [
      'Open developer.amazon.com/apps-and-games and register for the Amazon Appstore.',
      'Generate App Submission API credentials in Account Settings -> Security.',
      'Run: sh1pt secret set AMAZON_APPSTORE_CLIENT_ID <id>  (same credentials as tv-firetv)',
      'Run: sh1pt secret set AMAZON_APPSTORE_CLIENT_SECRET <secret>',
    ],
  }),
});
