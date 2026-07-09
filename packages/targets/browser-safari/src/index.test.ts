import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'browser', requireKind: true });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Safari extension build planning', () => {
  it('writes a dry-run package plan without invoking Xcode tooling', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-safari-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      projectDir: '/tmp/source-project',
      outDir,
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      bundleId: 'com.acme.MyExtension',
      scheme: 'BrowserApp',
      projectDir: 'apps/safari',
    });

    expect(result.artifact).toBe(join(outDir, 'com.acme.MyExtension-1.2.3.safari-plan.json'));

    const plan = JSON.parse(await readFile(result.artifact, 'utf8')) as {
      bundleId: string;
      version: string;
      projectDir: string;
      archivePath: string;
      converter: { command: string; args: string[]; cwd: string };
      archive: { command: string; args: string[]; cwd: string };
    };

    expect(plan.bundleId).toBe('com.acme.MyExtension');
    expect(plan.version).toBe('1.2.3');
    expect(plan.projectDir).toBe('/tmp/source-project/apps/safari');
    expect(plan.archivePath).toBe(join(outDir, 'com.acme.MyExtension-1.2.3.xcarchive'));
    expect(plan.converter).toMatchObject({
      command: 'xcrun',
      cwd: outDir,
    });
    expect(plan.converter.args).toContain('safari-web-extension-converter');
    expect(plan.converter.args).toContain('--bundle-identifier');
    expect(plan.archive).toMatchObject({
      command: 'xcodebuild',
      cwd: '/tmp/source-project/apps/safari',
    });
    expect(plan.archive.args).toContain('-archivePath');
    expect(plan.archive.args).toContain('generic/platform=macos');
  });

  it('rejects invalid Safari config before Xcode or App Store work', async () => {
    await expect(adapter.build(fakeBuildContext({ dryRun: true }) as any, {
      bundleId: '',
    })).rejects.toThrow('browser-safari requires bundleId');

    await expect(adapter.build(fakeBuildContext({ dryRun: true }) as any, {
      bundleId: 'com acme.Extension',
    })).rejects.toThrow('bundleId must look like a reverse-DNS identifier');

    await expect(adapter.build(fakeBuildContext({ dryRun: true }) as any, {
      bundleId: 'com.acme.Extension',
      projectDir: '',
    })).rejects.toThrow('browser-safari requires projectDir');

    await expect(adapter.build(fakeBuildContext({ dryRun: true }) as any, {
      bundleId: 'com.acme.Extension',
      scheme: '',
    })).rejects.toThrow('browser-safari requires scheme');

    await expect(adapter.ship(fakeShipContext({ dryRun: true }) as any, {
      bundleId: 'Extension',
    })).rejects.toThrow('bundleId must look like a reverse-DNS identifier');
  });
});
