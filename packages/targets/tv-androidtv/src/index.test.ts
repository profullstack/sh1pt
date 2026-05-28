import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

  it('validates a provided manifest before writing the plan', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-androidtv-project-'));
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-androidtv-out-'));
    tempDirs.push(projectDir, outDir);
    await mkdir(join(projectDir, 'app', 'src', 'main'), { recursive: true });
    await writeFile(join(projectDir, 'app', 'src', 'main', 'AndroidManifest.xml'), `
      <manifest package="com.acme.tv">
        <uses-feature android:name="android.software.leanback" android:required="true" />
        <application>
          <activity android:name=".MainActivity">
            <intent-filter>
              <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
            </intent-filter>
          </activity>
        </application>
      </manifest>
    `, 'utf-8');

    const result = await adapter.build(fakeBuildContext({
      projectDir,
      outDir,
      version: '1.2.3',
    }) as any, {
      packageName: 'com.acme.tv',
      track: 'beta',
      manifestPath: 'app/src/main/AndroidManifest.xml',
      gradleTask: ':tv:bundleRelease',
    });

    const plan = JSON.parse(await readFile(result.meta?.planFile as string, 'utf-8'));
    expect(plan).toMatchObject({
      packageName: 'com.acme.tv',
      version: '1.2.3',
      track: 'beta',
      manifestPath: join(projectDir, 'app', 'src', 'main', 'AndroidManifest.xml'),
      commands: [
        './gradlew :tv:bundleRelease',
        'play-developer-api edits.insert package=com.acme.tv',
        `play-developer-api edits.bundles.upload artifact=${join(outDir, 'androidtv', 'com.acme.tv.aab')}`,
        'play-developer-api edits.tracks.update track=beta',
        'play-developer-api edits.commit',
      ],
    });
  });

  it('rejects manifests missing Android TV requirements', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-androidtv-project-'));
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-androidtv-out-'));
    tempDirs.push(projectDir, outDir);
    await mkdir(join(projectDir, 'app', 'src', 'main'), { recursive: true });
    await writeFile(join(projectDir, 'app', 'src', 'main', 'AndroidManifest.xml'), '<manifest package="com.acme.tv" />', 'utf-8');

    await expect(adapter.build(fakeBuildContext({
      projectDir,
      outDir,
    }) as any, {
      packageName: 'com.acme.tv',
      track: 'internal',
      manifestPath: 'app/src/main/AndroidManifest.xml',
    })).rejects.toThrow('AndroidManifest must declare android.software.leanback');
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

  it('returns store metadata in real ship mode', async () => {
    await expect(adapter.ship(fakeShipContext({
      artifact: '/repo/.sh1pt/out/androidtv-package-plan.json',
      channel: 'stable',
      version: '1.2.3',
      dryRun: false,
    }) as any, {
      packageName: 'com.acme.tv',
      track: 'beta',
    })).resolves.toEqual({
      id: 'com.acme.tv@1.2.3',
      url: 'https://play.google.com/store/apps/details?id=com.acme.tv',
      meta: {
        artifact: '/repo/.sh1pt/out/androidtv-package-plan.json',
        track: 'beta',
      },
    });
  });
});
