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

describe('Scoop manifest generation', () => {
  it('writes a multi-architecture Scoop manifest from release config', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-scoop-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: 'v1.2.3',
    }) as any, {
      appName: 'myapp',
      downloadRepo: 'acme/myapp',
      description: 'Example command line app',
      homepage: 'https://example.com/myapp',
      license: 'MIT',
      bin: ['myapp.exe'],
      shortcuts: [['myapp.exe', 'My App']],
      checkver: 'github',
      autoupdate: {
        url: 'https://github.com/acme/myapp/releases/download/v$version/myapp-$version-$arch.zip',
      },
      architecture: [
        {
          name: '64bit',
          sha256: 'a'.repeat(64),
        },
        {
          name: 'arm64',
          url: 'https://downloads.example.com/myapp-{version}-windows-arm64.zip',
          sha256: 'b'.repeat(64),
          extractDir: 'myapp',
        },
      ],
    });

    expect(result.artifact).toBe(join(outDir, 'myapp.json'));

    const manifest = JSON.parse(await readFile(join(outDir, 'myapp.json'), 'utf-8'));
    expect(manifest.version).toBe('1.2.3');
    expect(manifest.description).toBe('Example command line app');
    expect(manifest.homepage).toBe('https://example.com/myapp');
    expect(manifest.license).toBe('MIT');
    expect(manifest.architecture['64bit'].url).toBe('https://github.com/acme/myapp/releases/download/v1.2.3/myapp-1.2.3-64bit.zip');
    expect(manifest.architecture['64bit'].hash).toBe('a'.repeat(64));
    expect(manifest.architecture['64bit'].bin).toEqual(['myapp.exe']);
    expect(manifest.architecture['64bit'].shortcuts).toEqual([['myapp.exe', 'My App']]);
    expect(manifest.architecture.arm64.url).toBe('https://downloads.example.com/myapp-1.2.3-windows-arm64.zip');
    expect(manifest.architecture.arm64.hash).toBe('b'.repeat(64));
    expect(manifest.architecture.arm64.extract_dir).toBe('myapp');
    expect(manifest.checkver).toBe('github');
    expect(manifest.autoupdate.url).toBe('https://github.com/acme/myapp/releases/download/v$version/myapp-$version-$arch.zip');
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      appName: 'myapp',
    })).resolves.toEqual({ id: 'dry-run' });
  });

  it('rejects invalid app names before writing manifests', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-scoop-'));
    tempDirs.push(outDir);

    await expect(adapter.build(fakeBuildContext({
      outDir,
      version: '1.2.3',
    }) as any, {
      appName: '../escape',
    })).rejects.toThrow('appName');

    await expect(adapter.build(fakeBuildContext({
      outDir,
      version: '1.2.3',
    }) as any, {
      appName: 'Bad Name',
    })).rejects.toThrow('appName');
  });
});
