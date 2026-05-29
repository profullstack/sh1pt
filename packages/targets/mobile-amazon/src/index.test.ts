import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'mobile', requireKind: true });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Amazon Appstore (Android) package planning', () => {
  it('writes an inspectable package plan with phone/tablet manifest requirements', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-amazon-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: '2.1.0',
      channel: 'stable',
    }) as any, {
      packageName: 'com.acme.app',
      appSku: 'ACMEANDROID',
    });

    const planFile = join(outDir, 'amazon-appstore-package-plan.json');
    expect(result.artifact).toBe(join(outDir, 'amazon', 'com.acme.app.apk'));
    expect(result.meta?.planFile).toBe(planFile);
    expect(result.meta?.deviceTargeting).toBe('phone-and-tablet');

    // build() must create the artifact's directory so the downstream APK build
    // can write to the reported path.
    expect((await stat(join(outDir, 'amazon'))).isDirectory()).toBe(true);

    const plan = JSON.parse(await readFile(planFile, 'utf-8')) as {
      appSku: string;
      packageName: string;
      version: string;
      artifact: string;
      deviceTargeting: string;
      manifestChecks: Array<{ requirement: string; required: boolean }>;
      commands: string[];
    };

    expect(plan.appSku).toBe('ACMEANDROID');
    expect(plan.packageName).toBe('com.acme.app');
    expect(plan.version).toBe('2.1.0');
    expect(plan.artifact).toBe(result.artifact);
    expect(plan.deviceTargeting).toBe('phone-and-tablet');
    expect(plan.manifestChecks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        requirement: 'category android:name="android.intent.category.LAUNCHER"',
        required: true,
      }),
      expect.objectContaining({
        requirement: 'uses-feature android:name="android.hardware.touchscreen" android:required="true"',
        required: true,
      }),
      expect.objectContaining({
        requirement: 'no hard dependency on com.google.android.gms (Play Services)',
        required: true,
      }),
    ]));
    // Scope boundary: Fire TV / Firestick is tv-firetv's job, so no leanback check here.
    expect(JSON.stringify(plan.manifestChecks)).not.toContain('leanback');
    expect(plan.commands).toContain('./gradlew :app:assembleRelease');
  });

  it('honors explicit phone-only targeting in dry-run shipping', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-amazon-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: '2.1.0',
    }) as any, {
      packageName: 'com.acme.app',
      appSku: 'ACMEANDROID',
      apkPath: 'dist/amazon.apk',
      deviceTargeting: 'phone-only',
    });

    expect(result.artifact).toBe('dist/amazon.apk');
    expect(result.meta?.deviceTargeting).toBe('phone-only');

    const ship = await adapter.ship(fakeShipContext({
      artifact: 'dist/amazon.apk',
      dryRun: true,
    }) as any, {
      packageName: 'com.acme.app',
      appSku: 'ACMEANDROID',
      apkPath: 'dist/amazon.apk',
      deviceTargeting: 'phone-only',
    });

    expect(ship).toEqual({
      id: 'dry-run',
      meta: {
        appSku: 'ACMEANDROID',
        packageName: 'com.acme.app',
        artifact: 'dist/amazon.apk',
        deviceTargeting: 'phone-only',
        commands: [
          'amazon-appstore edits.create appSku=ACMEANDROID',
          'amazon-appstore apk.upload artifact=dist/amazon.apk',
          'amazon-appstore targeting.update device=phone-only',
          'amazon-appstore edits.submit',
        ],
      },
    });
  });

  it('keeps the reported artifact and the upload command in sync without apkPath', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-amazon-'));
    tempDirs.push(outDir);

    // No apkPath: the artifact is derived under outDir. ship() must report the
    // artifact it was actually handed (ctx.artifact) AND reference that exact
    // path in the upload command — they must not diverge.
    const built = await adapter.build(fakeBuildContext({ outDir, version: '2.1.0' }) as any, {
      packageName: 'com.acme.app',
      appSku: 'ACMEANDROID',
    });

    const ship = await adapter.ship(fakeShipContext({
      outDir,
      artifact: built.artifact,
      dryRun: true,
    }) as any, {
      packageName: 'com.acme.app',
      appSku: 'ACMEANDROID',
    });

    expect(ship.meta?.artifact).toBe(built.artifact);
    expect(ship.meta?.commands).toContain(`amazon-appstore apk.upload artifact=${built.artifact}`);
  });
});
