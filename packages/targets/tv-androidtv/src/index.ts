import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  packageName: string;
  track: 'internal' | 'alpha' | 'beta' | 'production';
  aabPath?: string;
}

const PLAN_FILE = 'androidtv-package-plan.json';

function releaseTrack(channel: string, config: Config): Config['track'] {
  if (channel === 'stable') return config.track;
  if (channel === 'beta') return 'beta';
  return 'internal';
}

function artifactPath(ctx: { outDir: string }, config: Config): string {
  return config.aabPath ?? join(ctx.outDir, 'androidtv', `${config.packageName}.aab`);
}

function buildPlan(ctx: { outDir: string; version: string; channel: string }, config: Config) {
  const artifact = artifactPath(ctx, config);
  const track = releaseTrack(ctx.channel, config);
  return {
    packageName: config.packageName,
    version: ctx.version,
    channel: ctx.channel,
    track,
    artifact,
    planFile: join(ctx.outDir, PLAN_FILE),
    manifestChecks: [
      {
        path: 'AndroidManifest.xml',
        requirement: 'uses-feature android:name="android.software.leanback"',
        required: true,
      },
      {
        path: 'AndroidManifest.xml',
        requirement: 'category android:name="android.intent.category.LEANBACK_LAUNCHER"',
        required: true,
      },
      {
        path: 'AndroidManifest.xml',
        requirement: 'category android:name="android.intent.category.LAUNCHER"',
        required: true,
      },
    ],
    commands: [
      './gradlew :app:bundleRelease',
      `play-developer-api edits.insert package=${config.packageName}`,
      `play-developer-api edits.bundles.upload artifact=${artifact}`,
      `play-developer-api edits.tracks.update track=${track}`,
      'play-developer-api edits.commit',
    ],
  };
}

export default defineTarget<Config>({
  id: 'tv-androidtv',
  kind: 'tv',
  label: 'Play Store (Android TV)',
  async build(ctx, config) {
    const plan = buildPlan(ctx, config);
    ctx.log(`androidtv plan ${config.packageName} -> ${plan.track}`);
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(plan.planFile, `${JSON.stringify(plan, null, 2)}\n`, 'utf-8');
    return {
      artifact: plan.artifact,
      meta: {
        planFile: plan.planFile,
        track: plan.track,
        manifestChecks: plan.manifestChecks,
      },
    };
  },
  async ship(ctx, config) {
    const track = releaseTrack(ctx.channel, config);
    const plan = buildPlan(ctx, config);
    ctx.log(`upload to Play Console package=${config.packageName} track=${track}`);
    if (ctx.dryRun) {
      return {
        id: 'dry-run',
        meta: {
          packageName: config.packageName,
          artifact: ctx.artifact,
          track,
          commands: plan.commands.slice(1),
        },
      };
    }
    // TODO: Google Play Developer Publishing API (edit -> upload bundle -> commit to track)
    return {
      id: `${config.packageName}@${ctx.version}`,
      url: `https://play.google.com/store/apps/details?id=${config.packageName}`,
    };
  },
  async status(id) {
    return { state: 'in-review', version: id };
  },

  setup: manualSetup({
    label: 'Android TV (Google Play Console)',
    vendorDocUrl: 'https://play.google.com/console',
    steps: [
      'Use the same Google Play Console flow as mobile Android, with Android TV enabled as a form factor.',
      'Declare android.software.leanback plus LAUNCHER and LEANBACK_LAUNCHER in AndroidManifest.xml.',
      'Run: sh1pt secret set PLAY_CONSOLE_SERVICE_ACCOUNT_JSON <path-to-json>',
    ],
  }),
});
