import { fakeBuildContext, fakeShipContext, makeVault, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { execMock } = vi.hoisted(() => ({
  execMock: vi.fn(),
}));

vi.mock('@profullstack/sh1pt-core', async () => ({
  ...await vi.importActual<typeof import('@profullstack/sh1pt-core')>('@profullstack/sh1pt-core'),
  exec: execMock,
}));

import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'mobile', requireKind: true });

const tempDirs: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('mobile-expo target adapter', () => {
  it('writes an EAS package plan without invoking the CLI in dry-run builds', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-expo-out-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-expo-project-'));
    tempDirs.push(outDir, projectDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      projectDir,
      version: '1.2.3',
      channel: 'beta',
      dryRun: true,
    }) as any, {
      appId: '@acme/mobile-app',
      platform: 'ios',
      profile: 'internal',
    });

    expect(execMock).not.toHaveBeenCalled();
    expect(result.artifact).toBe(join(outDir, 'acme-mobile-app-1.2.3.eas-plan.json'));
    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan).toEqual({
      provider: 'expo-eas',
      appId: '@acme/mobile-app',
      version: '1.2.3',
      channel: 'beta',
      platform: 'ios',
      profile: 'internal',
      projectDir,
      build: {
        command: 'eas',
        args: ['build', '--platform', 'ios', '--profile', 'internal', '--non-interactive', '--json'],
        cwd: projectDir,
      },
      metadataArtifact: join(outDir, 'acme-mobile-app-1.2.3.eas-build.json'),
    });
  });

  it('rejects unsupported platforms while building', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-expo-out-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-expo-project-'));
    tempDirs.push(outDir, projectDir);

    await expect(adapter.build(fakeBuildContext({
      outDir,
      projectDir,
      version: '1.2.3',
      channel: 'beta',
      dryRun: true,
    }) as any, {
      appId: '@acme/mobile-app',
      platform: 'web',
    } as any)).rejects.toThrow('mobile-expo platform must be one of: ios, android, all');
    expect(execMock).not.toHaveBeenCalled();
  });

  it('runs EAS with argv args and writes build metadata for real builds', async () => {
    execMock.mockResolvedValue({ exitCode: 0, stdout: '{"buildId":"abc"}\n', stderr: '' });

    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-expo-out-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-expo-project-'));
    tempDirs.push(outDir, projectDir);

    const ctx = fakeBuildContext({
      outDir,
      projectDir,
      version: '1.2.3',
      channel: 'stable',
      dryRun: false,
      secret: makeVault({ EXPO_TOKEN: 'expo-token' }),
    });
    const result = await adapter.build(ctx as any, {
      appId: 'acme-mobile',
      platform: 'android',
    });

    const artifact = join(outDir, 'acme-mobile-1.2.3.eas-build.json');
    expect(execMock).toHaveBeenCalledWith('eas', [
      'build',
      '--platform',
      'android',
      '--profile',
      'production',
      '--non-interactive',
      '--json',
    ], {
      cwd: projectDir,
      env: { EXPO_TOKEN: 'expo-token' },
      log: ctx.log,
      throwOnNonZero: true,
    });
    expect(result).toEqual({ artifact });
    expect(await readFile(artifact, 'utf-8')).toBe('{"buildId":"abc"}\n');
  });

  it('returns the planned EAS update command for dry-run ships', async () => {
    const ctx = fakeShipContext({
      projectDir: '/tmp/expo-app',
      version: '1.2.3',
      channel: 'canary',
      dryRun: true,
    });

    const result = await adapter.ship(ctx as any, {
      appId: 'acme-mobile',
    });

    expect(execMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: 'dry-run',
      meta: {
        command: {
          command: 'eas',
          args: ['update', '--channel', 'canary', '--non-interactive'],
          cwd: '/tmp/expo-app',
        },
      },
    });
  });

  it('runs EAS submit with argv args for real submit ships', async () => {
    execMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    const ctx = fakeShipContext({
      projectDir: '/tmp/expo-app',
      version: '1.2.3',
      channel: 'stable',
      dryRun: false,
      secret: makeVault({ EXPO_TOKEN: 'expo-token' }),
    });

    const result = await adapter.ship(ctx as any, {
      appId: 'acme-mobile',
      platform: 'ios',
      profile: 'production',
      submit: true,
    });

    expect(execMock).toHaveBeenCalledWith('eas', [
      'submit',
      '--platform',
      'ios',
      '--profile',
      'production',
      '--non-interactive',
    ], {
      cwd: '/tmp/expo-app',
      env: { EXPO_TOKEN: 'expo-token' },
      log: ctx.log,
      throwOnNonZero: true,
    });
    expect(result).toEqual({
      id: 'acme-mobile@1.2.3',
      url: 'https://expo.dev/accounts/acme-mobile',
    });
  });

  it('rejects unsupported platforms while shipping', async () => {
    await expect(adapter.ship(fakeShipContext({
      projectDir: '/tmp/expo-app',
      version: '1.2.3',
      channel: 'stable',
      dryRun: true,
    }) as any, {
      appId: 'acme-mobile',
      platform: 'web',
      submit: true,
    } as any)).rejects.toThrow('mobile-expo platform must be one of: ios, android, all');
    expect(execMock).not.toHaveBeenCalled();
  });
});
