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

describe('Fire TV package planning', () => {
  it('writes an inspectable package plan with Fire TV manifest requirements', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-firetv-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: '1.8.0',
      channel: 'stable',
    }) as any, {
      packageName: 'com.acme.firetv',
      appSku: 'ACMEFIRETV',
    });

    const planFile = join(outDir, 'firetv-package-plan.json');
    expect(result.artifact).toBe(join(outDir, 'firetv', 'com.acme.firetv.apk'));
    expect(result.meta?.planFile).toBe(planFile);
    expect(result.meta?.deviceTargeting).toBe('firetv-only');

    const plan = JSON.parse(await readFile(planFile, 'utf-8')) as {
      appSku: string;
      packageName: string;
      version: string;
      artifact: string;
      deviceTargeting: string;
      manifestChecks: Array<{ requirement: string; required: boolean }>;
      commands: string[];
    };

    expect(plan.appSku).toBe('ACMEFIRETV');
    expect(plan.packageName).toBe('com.acme.firetv');
    expect(plan.version).toBe('1.8.0');
    expect(plan.artifact).toBe(result.artifact);
    expect(plan.deviceTargeting).toBe('firetv-only');
    expect(plan.manifestChecks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        requirement: 'category android:name="android.intent.category.LEANBACK_LAUNCHER"',
        required: true,
      }),
      expect.objectContaining({
        requirement: 'uses-feature android:name="android.hardware.touchscreen" android:required="false"',
        required: true,
      }),
    ]));
    expect(plan.commands).toContain('./gradlew :app:assembleRelease');
  });

  it('keeps shared phone and Fire TV targeting explicit in dry-run shipping', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-firetv-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: '1.8.0',
    }) as any, {
      packageName: 'com.acme.firetv',
      appSku: 'ACMEFIRETV',
      apkPath: 'dist/firetv.apk',
      deviceTargeting: 'firetv-and-phone',
    });

    expect(result.artifact).toBe('dist/firetv.apk');
    expect(result.meta?.deviceTargeting).toBe('firetv-and-phone');

    const ship = await adapter.ship(fakeShipContext({
      artifact: 'dist/firetv.apk',
      dryRun: true,
    }) as any, {
      packageName: 'com.acme.firetv',
      appSku: 'ACMEFIRETV',
      apkPath: 'dist/firetv.apk',
      deviceTargeting: 'firetv-and-phone',
    });

    expect(ship).toEqual({
      id: 'dry-run',
      meta: {
        appSku: 'ACMEFIRETV',
        packageName: 'com.acme.firetv',
        artifact: 'dist/firetv.apk',
        deviceTargeting: 'firetv-and-phone',
        commands: [
          'amazon-appstore edits.create appSku=ACMEFIRETV',
          'amazon-appstore apk.upload artifact=dist/firetv.apk',
          'amazon-appstore targeting.update device=firetv-and-phone',
          'amazon-appstore edits.submit',
        ],
      },
    });
  });

  it('rejects package names with path separators before writing the plan', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-firetv-'));
    tempDirs.push(outDir);

    await expect(adapter.build(fakeBuildContext({
      outDir,
      version: '1.8.0',
    }) as any, {
      packageName: '../com.acme.firetv',
      appSku: 'ACMEFIRETV',
    })).rejects.toThrow('packageName');
  });

  it('rejects package names without multiple Java identifier segments', async () => {
    await expect(adapter.ship(fakeShipContext({
      artifact: 'dist/firetv.apk',
      dryRun: true,
    }) as any, {
      packageName: 'firetv',
      appSku: 'ACMEFIRETV',
    })).rejects.toThrow('packageName');
  });
});
