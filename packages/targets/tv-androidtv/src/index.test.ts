import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'tv', requireKind: true });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Android TV package planning', () => {
  it('writes an inspectable package plan with TV manifest requirements', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-androidtv-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: '2.4.0',
      channel: 'stable',
    }) as any, {
      packageName: 'com.acme.tv',
      track: 'alpha',
    });

    const planFile = join(outDir, 'androidtv-package-plan.json');
    expect(result.artifact).toBe(join(outDir, 'androidtv', 'com.acme.tv.aab'));
    expect(result.meta?.planFile).toBe(planFile);
    expect(result.meta?.track).toBe('alpha');

    const plan = JSON.parse(await readFile(planFile, 'utf-8')) as {
      packageName: string;
      version: string;
      track: string;
      artifact: string;
      manifestChecks: Array<{ requirement: string; required: boolean }>;
      commands: string[];
    };

    expect(plan.packageName).toBe('com.acme.tv');
    expect(plan.version).toBe('2.4.0');
    expect(plan.track).toBe('alpha');
    expect(plan.artifact).toBe(result.artifact);
    expect(plan.manifestChecks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        requirement: 'uses-feature android:name="android.software.leanback"',
        required: true,
      }),
      expect.objectContaining({
        requirement: 'category android:name="android.intent.category.LEANBACK_LAUNCHER"',
        required: true,
      }),
    ]));
    expect(plan.commands).toContain('./gradlew :app:bundleRelease');
  });

  it('maps non-stable channels to safe test tracks', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-androidtv-'));
    tempDirs.push(outDir);

    const beta = await adapter.build(fakeBuildContext({
      outDir,
      version: '2.4.0',
      channel: 'beta',
    }) as any, {
      packageName: 'com.acme.tv',
      track: 'production',
      aabPath: 'dist/tv-release.aab',
    });

    expect(beta.artifact).toBe('dist/tv-release.aab');
    expect(beta.meta?.track).toBe('beta');

    const canaryShip = await adapter.ship(fakeShipContext({
      channel: 'canary',
      artifact: 'dist/tv-release.aab',
      dryRun: true,
    }) as any, {
      packageName: 'com.acme.tv',
      track: 'production',
      aabPath: 'dist/tv-release.aab',
    });

    expect(canaryShip).toEqual({
      id: 'dry-run',
      meta: {
        packageName: 'com.acme.tv',
        artifact: 'dist/tv-release.aab',
        track: 'internal',
        commands: [
          'play-developer-api edits.insert package=com.acme.tv',
          'play-developer-api edits.bundles.upload artifact=dist/tv-release.aab',
          'play-developer-api edits.tracks.update track=internal',
          'play-developer-api edits.commit',
        ],
      },
    });
  });
});
