import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { smokeTest } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'pkg', requireKind: true });

describe('pkg-scoop build', () => {
  it('writes a Scoop manifest from release metadata', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-scoop-'));
    try {
      const result = await adapter.build({
        projectDir: '/tmp/project',
        outDir,
        version: '1.2.3',
        channel: 'stable',
        env: {},
        secret: () => undefined,
        log: () => {},
      }, {
        appName: 'demo-cli',
        urlTemplate: 'https://example.com/demo-cli-v{{version}}.zip',
        hash: 'sha256:abc123',
        bin: ['demo.exe'],
        homepage: 'https://example.com/demo-cli',
        license: 'MIT',
        description: 'Demo CLI',
        shortcuts: [{ target: 'demo.exe', name: 'Demo CLI', arguments: '--help' }],
        envAddPath: 'bin',
      });

      expect(result.artifact).toBe(join(outDir, 'demo-cli.json'));
      const manifest = JSON.parse(await readFile(result.artifact, 'utf8'));
      expect(manifest).toMatchObject({
        version: '1.2.3',
        description: 'Demo CLI',
        homepage: 'https://example.com/demo-cli',
        license: 'MIT',
        url: 'https://example.com/demo-cli-v1.2.3.zip',
        hash: 'abc123',
        bin: ['demo.exe'],
        env_add_path: 'bin',
      });
      expect(manifest.shortcuts).toEqual([['demo.exe', 'Demo CLI', '--help']]);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it('supports architecture-specific downloads', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-scoop-'));
    try {
      const result = await adapter.build({
        projectDir: '/tmp/project',
        outDir,
        version: '2.0.0',
        channel: 'stable',
        env: {},
        secret: () => undefined,
        log: () => {},
      }, {
        appName: 'arch-cli',
        url: 'https://example.com/arch-cli.zip',
        architecture: {
          '64bit': { url: 'https://example.com/arch-cli-x64.zip', hash: 'sha256:x64hash' },
          arm64: { url: 'https://example.com/arch-cli-arm64.zip', hash: 'armhash' },
        },
      });

      const manifest = JSON.parse(await readFile(result.artifact, 'utf8'));
      expect(manifest.architecture).toEqual({
        '64bit': { url: 'https://example.com/arch-cli-x64.zip', hash: 'x64hash' },
        arm64: { url: 'https://example.com/arch-cli-arm64.zip', hash: 'armhash' },
      });
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it('requires a download URL source', async () => {
    await expect(adapter.build({
      projectDir: '/tmp/project',
      outDir: '/tmp/out',
      version: '1.0.0',
      channel: 'stable',
      env: {},
      secret: () => undefined,
      log: () => {},
    }, { appName: 'missing-url' })).rejects.toThrow('pkg-scoop requires config.url or config.urlTemplate');
  });
});
