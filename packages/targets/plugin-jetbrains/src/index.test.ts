import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'plugin', requireKind: true });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('JetBrains plugin target', () => {
  it('writes a dry-run Gradle build plan with the expected plugin artifact', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-jetbrains-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      projectDir: '/repo',
      outDir,
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      pluginId: '12345',
      projectDir: 'plugins/idea',
      gradleCommand: './gradlew',
      buildTask: 'buildPlugin',
    });

    expect(result.artifact).toBe(join(outDir, 'jetbrains-build-plan.json'));
    await expect(readFile(result.artifact, 'utf-8').then(JSON.parse)).resolves.toEqual({
      cwd: join('/repo', 'plugins/idea'),
      command: ['./gradlew', 'buildPlugin', '--no-daemon'],
      artifact: join('/repo', 'plugins/idea', 'build', 'distributions', '12345-1.2.3.zip'),
    });
  });

  it('keeps dry-run publishing side-effect free and exposes the Gradle command', async () => {
    await expect(adapter.ship(fakeShipContext({
      projectDir: '/repo',
      dryRun: true,
    }) as any, {
      pluginId: '12345',
      channel: 'eap',
      projectDir: 'plugins/idea',
      gradleCommand: './gradlew',
      publishTask: 'publishPlugin',
    })).resolves.toEqual({
      id: 'dry-run',
      meta: {
        cwd: join('/repo', 'plugins/idea'),
        command: ['./gradlew', 'publishPlugin', '-PpluginVersionChannel=eap', '--no-daemon'],
      },
    });
  });

  it('rejects non-numeric plugin IDs before writing dry-run build plans', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-jetbrains-'));
    tempDirs.push(outDir);

    await expect(adapter.build(fakeBuildContext({
      projectDir: '/repo',
      outDir,
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      pluginId: 'plugin-12345',
      projectDir: 'plugins/idea',
    })).rejects.toThrow('pluginId must be numeric');
  });

  it('rejects unsupported publish channels before dry-run publishing', async () => {
    await expect(adapter.ship(fakeShipContext({
      projectDir: '/repo',
      dryRun: true,
    }) as any, {
      pluginId: '12345',
      channel: 'preview',
      projectDir: 'plugins/idea',
    } as any)).rejects.toThrow('channel must be one of');
  });
});
