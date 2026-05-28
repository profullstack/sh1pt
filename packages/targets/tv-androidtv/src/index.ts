import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  packageName: string;
  track: 'internal' | 'alpha' | 'beta' | 'production';
  aabPath?: string;
  manifestPath?: string;
  gradleTask?: string;
}

const PLAN_FILE = 'androidtv-package-plan.json';

function requirePackageName(config: Config): string {
  const packageName = config.packageName?.trim();
  if (!packageName) throw new Error('tv-androidtv requires packageName');
  return packageName;
}

function releaseTrack(channel: string, config: Config): Config['track'] {
  if (channel === 'stable') return config.track;
  if (channel === 'beta') return 'beta';
  return 'internal';
}

function artifactPath(ctx: { outDir: string }, config: Config): string {
  return config.aabPath ?? join(ctx.outDir, 'androidtv', `${requirePackageName(config)}.aab`);
}

function validateAndroidTvManifest(manifest: string, packageName: string): void {
  const packageMatch = manifest.match(/\bpackage\s*=\s*["']([^"']+)["']/);
  if (packageMatch?.[1] && packageMatch[1] !== packageName) {
    throw new Error(`AndroidManifest package must match packageName (${packageName})`);
  }
  if (!manifest.includes('android.software.leanback')) {
    throw new Error('AndroidManifest must declare android.software.leanback');
  }
  if (!manifest.includes('android.intent.category.LEANBACK_LAUNCHER')) {
    throw new Error('AndroidManifest must declare LEANBACK_LAUNCHER');
  }
}

async function maybeValidateManifest(ctx: { projectDir: string }, config: Config): Promise<string | undefined> {
  if (!config.manifestPath) return undefined;
  const manifestPath = resolve(ctx.projectDir, config.manifestPath);
  validateAndroidTvManifest(await readFile(manifestPath, 'utf-8'), requirePackageName(config));
  return manifestPath;
}

async function buildPlan(ctx: { projectDir: string; outDir: string; version: string; channel: string }, config: Config) {
  const packageName = requirePackageName(config);
  const artifact = artifactPath(ctx, config);
  const track = releaseTrack(ctx.channel, config);
  const gradleTask = config.gradleTask ?? ':app:bundleRelease';
  const manifestPath = await maybeValidateManifest(ctx, config);
  return {
    packageName,
    version: ctx.version,
    channel: ctx.channel,
    track,
    artifact,
    planFile: join(ctx.outDir, PLAN_FILE),
    manifestPath,
    manifestChecks: [
      {
        path: manifestPath ?? 'AndroidManifest.xml',
        requirement: 'uses-feature android:name="android.software.leanback"',
        required: true,
      },
      {
        path: manifestPath ?? 'AndroidManifest.xml',
        requirement: 'category android:name="android.intent.category.LEANBACK_LAUNCHER"',
        required: true,
      },
      {
        path: manifestPath ?? 'AndroidManifest.xml',
        requirement: 'category android:name="android.intent.category.LAUNCHER"',
        required: true,
      },
    ],
    commands: [
      `./gradlew ${gradleTask}`,
      `play-developer-api edits.insert package=${packageName}`,
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
    const plan = await buildPlan(ctx, config);
    ctx.log(`androidtv plan ${plan.packageName} -> ${plan.track}`);
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
    const plan = await buildPlan(ctx, config);
    const packageName = requirePackageName(config);
    ctx.log(`upload to Play Console package=${packageName} track=${track}`);
    if (ctx.dryRun) {
      return {
        id: 'dry-run',
        meta: {
          packageName,
          artifact: ctx.artifact,
          track,
          commands: plan.commands.slice(1),
        },
      };
    }
    // TODO: Google Play Developer Publishing API (edit -> upload bundle -> commit to track)
    return {
      id: `${packageName}@${ctx.version}`,
      url: `https://play.google.com/store/apps/details?id=${packageName}`,
      meta: {
        artifact: ctx.artifact,
        track,
      },
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
