import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'pkg', requireKind: true });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Flatpak manifest generation', () => {
  it('writes a flatpak-builder manifest from release config', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-flatpak-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      projectDir: '/repo/myapp',
      version: '1.2.3',
      channel: 'stable',
    }) as any, {
      appId: 'com.example.MyApp',
      runtime: 'org.freedesktop.Platform',
      runtimeVersion: '24.08',
      sdk: 'org.freedesktop.Sdk',
      sdkExtensions: ['org.freedesktop.Sdk.Extension.node22'],
      command: 'myapp',
      moduleName: 'myapp',
      buildCommands: ['install -D myapp "$FLATPAK_DEST/bin/myapp"'],
      sourceUrl: 'https://downloads.example.com/myapp-1.2.3.tar.gz',
      sourceSha256: 'a'.repeat(64),
      finishArgs: ['--share=network', '--filesystem=home:ro'],
    });

    expect(result.artifact).toBe(join(outDir, 'com.example.MyApp.yml'));
    const manifest = await readFile(result.artifact, 'utf-8');

    expect(manifest).toContain('app-id: "com.example.MyApp"');
    expect(manifest).toContain('runtime-version: "24.08"');
    expect(manifest).toContain('sdk: "org.freedesktop.Sdk"');
    expect(manifest).toContain('command: "myapp"');
    expect(manifest).toContain('branch: "stable"');
    expect(manifest).toContain('  - "org.freedesktop.Sdk.Extension.node22"');
    expect(manifest).toContain('  - "--filesystem=home:ro"');
    expect(manifest).toContain('buildsystem: "simple"');
    expect(manifest).toContain('      - "install -D myapp \\"$FLATPAK_DEST/bin/myapp\\""');
    expect(manifest).toContain('      - type: archive');
    expect(manifest).toContain('url: "https://downloads.example.com/myapp-1.2.3.tar.gz"');
    expect(manifest).toContain(`sha256: "${'a'.repeat(64)}"`);
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      appId: 'com.example.MyApp',
    })).resolves.toEqual({ id: 'dry-run' });
  });

  it('rejects invalid app IDs before manifest generation', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-flatpak-'));
    tempDirs.push(outDir);
    const ctx = fakeBuildContext({
      outDir,
      projectDir: '/repo/myapp',
      version: '1.2.3',
      channel: 'stable',
    }) as any;

    for (const appId of ['../escape', 'com.example', 'com.example.App-', 'com.123.App']) {
      await expect(adapter.build(ctx, { appId })).rejects.toThrow('appId');
    }
  });

  it('rejects invalid app IDs before shipping', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      appId: '../escape',
    })).rejects.toThrow('appId');
  });
});
