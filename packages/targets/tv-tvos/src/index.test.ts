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

describe('tvOS package planning', () => {
  it('writes an inspectable tvOS archive and export plan', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-tvos-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: '3.1.0',
      channel: 'stable',
    }) as any, {
      bundleId: 'com.acme.tvos',
      teamId: 'TEAM123456',
      scheme: 'AcmeTV',
    });

    const planFile = join(outDir, 'tvos-package-plan.json');
    expect(result.artifact).toBe(join(outDir, 'tvos', 'com.acme.tvos.ipa'));
    expect(result.meta?.planFile).toBe(planFile);
    expect(result.meta?.destination).toBe('app-store');

    const plan = JSON.parse(await readFile(planFile, 'utf-8')) as {
      bundleId: string;
      teamId: string;
      version: string;
      scheme: string;
      destination: string;
      archivePath: string;
      exportOptions: string;
      requirements: string[];
      commands: string[];
    };

    expect(plan.bundleId).toBe('com.acme.tvos');
    expect(plan.teamId).toBe('TEAM123456');
    expect(plan.version).toBe('3.1.0');
    expect(plan.scheme).toBe('AcmeTV');
    expect(plan.destination).toBe('app-store');
    expect(plan.archivePath).toBe(join(outDir, 'tvos', 'com.acme.tvos.xcarchive'));
    expect(plan.exportOptions).toBe(join(outDir, 'tvos', 'ExportOptions.plist'));
    expect(plan.requirements).toContain('macOS runner with Xcode and the tvOS SDK installed');
    expect(plan.commands[0]).toContain('xcodebuild -scheme AcmeTV -sdk appletvos archive');
    expect(plan.commands[1]).toContain('xcodebuild -exportArchive');
  });

  it('keeps TestFlight group routing visible in dry-run shipping', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-tvos-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: '3.1.0',
      channel: 'beta',
    }) as any, {
      bundleId: 'com.acme.tvos',
      teamId: 'TEAM123456',
      testflightGroups: ['qa', 'founders'],
      ipaPath: 'dist/tvos.ipa',
    });

    expect(result.artifact).toBe('dist/tvos.ipa');
    expect(result.meta?.destination).toBe('testflight:qa,founders');

    const ship = await adapter.ship(fakeShipContext({
      channel: 'beta',
      artifact: 'dist/tvos.ipa',
      dryRun: true,
    }) as any, {
      bundleId: 'com.acme.tvos',
      teamId: 'TEAM123456',
      testflightGroups: ['qa', 'founders'],
      ipaPath: 'dist/tvos.ipa',
    });

    expect(ship).toEqual({
      id: 'dry-run',
      meta: {
        bundleId: 'com.acme.tvos',
        artifact: 'dist/tvos.ipa',
        destination: 'testflight:qa,founders',
        commands: [
          'xcrun altool --upload-app --type tvos --file dist/tvos.ipa',
        ],
      },
    });
  });
});
