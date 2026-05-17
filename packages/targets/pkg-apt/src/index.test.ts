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

describe('apt package metadata generation', () => {
  it('writes Debian control metadata and per-architecture Packages indexes', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-apt-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: 'v1.2.3',
    }) as any, {
      packageName: 'myapp',
      architecture: ['amd64', 'arm64'],
      distribution: 'noble',
      component: 'main',
      maintainer: 'Example Maintainer <maintainer@example.com>',
      description: 'Example command line app',
      section: 'devel',
      priority: 'optional',
      depends: ['libc6 (>= 2.35)', 'curl'],
      homepage: 'https://example.com/myapp',
      packageSize: 12345,
      packageSha256: 'b'.repeat(64),
    });

    expect(result.artifact).toBe(join(outDir, 'debian', 'control'));

    const control = await readFile(join(outDir, 'debian', 'control'), 'utf-8');
    expect(control).toContain('Source: myapp');
    expect(control).toContain('Section: devel');
    expect(control).toContain('Maintainer: Example Maintainer <maintainer@example.com>');
    expect(control).toContain('Package: myapp');
    expect(control).toContain('Architecture: amd64 arm64');
    expect(control).toContain('Depends: libc6 (>= 2.35), curl');
    expect(control).toContain('Description: Example command line app');
    expect(control).toContain('Homepage: https://example.com/myapp');

    const packages = await readFile(join(outDir, 'dists', 'noble', 'main', 'binary-amd64', 'Packages'), 'utf-8');
    expect(packages).toContain('Package: myapp');
    expect(packages).toContain('Version: 1.2.3');
    expect(packages).toContain('Architecture: amd64');
    expect(packages).toContain('Filename: pool/main/m/myapp/myapp_1.2.3_amd64.deb');
    expect(packages).toContain('Size: 12345');
    expect(packages).toContain(`SHA256: ${'b'.repeat(64)}`);
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      packageName: 'myapp',
    })).resolves.toEqual({ id: 'dry-run' });
  });
});
