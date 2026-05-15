import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'mobile', requireKind: true });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Expo / EAS mobile target', () => {
  it('writes an inspectable dry-run EAS build plan', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-expo-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-project-'));
    tempDirs.push(outDir, projectDir);

    const result = await adapter.build(fakeBuildContext({
      channel: 'stable',
      outDir,
      projectDir,
      version: '1.2.3',
    }) as any, {
      appId: 'acme-mobile',
      platform: 'ios',
      projectDir: 'apps/mobile',
    });

    expect(result.artifact).toBe(join(outDir, 'expo-eas-build.json'));
    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan).toMatchObject({
      provider: 'expo-eas',
      appId: 'acme-mobile',
      version: '1.2.3',
      projectDir: join(projectDir, 'apps/mobile'),
      platform: 'ios',
      profile: 'production',
      channel: 'stable',
    });
    expect(plan.command).toEqual([
      'eas',
      'build',
      '--platform',
      'ios',
      '--profile',
      'production',
      '--non-interactive',
      '--json',
    ]);
  });

  it('returns the resolved EAS update command for dry-run ships', async () => {
    await expect(adapter.ship(fakeShipContext({
      channel: 'beta',
      projectDir: '/repo',
      dryRun: true,
    }) as any, {
      appId: 'acme-mobile',
      projectDir: 'apps/mobile',
    })).resolves.toMatchObject({
      id: 'dry-run',
      meta: {
        projectDir: join('/repo', 'apps/mobile'),
        command: ['eas', 'update', '--channel', 'beta', '--non-interactive', '--json'],
      },
    });
  });

  it('requires an Expo token for real builds', async () => {
    await expect(adapter.build(fakeBuildContext({
      dryRun: false,
    }) as any, {
      appId: 'acme-mobile',
    })).rejects.toThrow('EXPO_TOKEN not in vault');
  });
});
