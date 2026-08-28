import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

const childProcessMocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  ...childProcessMocks,
}));

smokeTest(adapter, { idPrefix: 'browser', requireKind: true });

const tempDirs: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  vi.restoreAllMocks();
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

  it('passes upload values as literal arguments instead of interpolating a shell command', async () => {
    const privateKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
      .privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: 'app-123', attributes: { name: 'Safe Extension' } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 201 }));
    const uploadDir = await mkdtemp(join(tmpdir(), 'sh1pt-safari-upload-'));
    tempDirs.push(uploadDir);
    const artifact = join(uploadDir, 'release $(touch should-not-run).pkg');
    const appleId = 'publisher+$(touch should-not-run)@example.com';

    await adapter.ship(fakeShipContext({
      artifact,
      dryRun: false,
      secret: (key: string) => ({
        APP_STORE_CONNECT_KEY_ID: 'KEY1234567',
        APP_STORE_CONNECT_ISSUER_ID: '00000000-0000-0000-0000-000000000000',
        APP_STORE_CONNECT_PRIVATE_KEY: privateKey,
      })[key],
    }) as any, {
      bundleId: 'com.acme.Extension',
      appleId,
    });

    expect(childProcessMocks.execSync).not.toHaveBeenCalled();
    expect(childProcessMocks.execFileSync).toHaveBeenCalledWith(
      'xcrun',
      [
        'altool', '--upload-app', '-f', artifact,
        '-u', appleId, '-p', '@env:APP_STORE_CONNECT_PRIVATE_KEY',
        '--type', 'macos', '--output-format', 'json',
      ],
      expect.objectContaining({
        stdio: 'pipe',
        env: expect.objectContaining({ APP_STORE_CONNECT_PRIVATE_KEY: privateKey }),
      }),
    );

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: 'app-123', attributes: { name: 'Safe Extension' } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 201 }));
    childProcessMocks.execFileSync.mockImplementationOnce(() => {
      throw new Error('upload rejected');
    });

    await expect(adapter.ship(fakeShipContext({
      artifact,
      dryRun: false,
      secret: (key: string) => ({
        APP_STORE_CONNECT_KEY_ID: 'KEY1234567',
        APP_STORE_CONNECT_ISSUER_ID: '00000000-0000-0000-0000-000000000000',
        APP_STORE_CONNECT_PRIVATE_KEY: privateKey,
      })[key],
    }) as any, {
      bundleId: 'com.acme.Extension',
      appleId,
    })).rejects.toThrow('App Store upload failed');
    expect(childProcessMocks.execSync).not.toHaveBeenCalled();
  });
});
