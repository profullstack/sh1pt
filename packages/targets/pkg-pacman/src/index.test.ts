import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'pkg', requireKind: true });

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('PKGBUILD generation', () => {
  it('writes PKGBUILD and .SRCINFO from config', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-pacman-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({ outDir, version: 'v3.0.1' }) as any, {
      pkgname: 'myapp',
      pkgdesc: 'An example CLI tool',
      license: 'MIT',
      url: 'https://example.com',
      arch: 'x86_64',
      releaseRepo: 'acme/myapp',
      depends: ['glibc', 'gcc-libs'],
      sha512sum: 'a'.repeat(128),
    });

    expect(result.artifact).toBe(join(outDir, 'PKGBUILD'));

    const pkgbuild = await readFile(join(outDir, 'PKGBUILD'), 'utf-8');
    expect(pkgbuild).toContain('pkgname=myapp');
    expect(pkgbuild).toContain('pkgver=3.0.1');
    expect(pkgbuild).toContain('pkgdesc="An example CLI tool"');
    expect(pkgbuild).toContain("arch=('x86_64')");
    expect(pkgbuild).toContain("license=('MIT')");
    expect(pkgbuild).toContain("depends=('glibc' 'gcc-libs')");
    expect(pkgbuild).toContain('sha512sums=(\'' + 'a'.repeat(128) + '\')');
    expect(pkgbuild).toContain('package()');

    const srcinfo = await readFile(join(outDir, '.SRCINFO'), 'utf-8');
    expect(srcinfo).toContain('pkgbase = myapp');
    expect(srcinfo).toContain('pkgver = 3.0.1');
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({ version: '3.0.1', dryRun: true }) as any, {
      pkgname: 'myapp',
    })).resolves.toEqual({ id: 'dry-run' });
  });
});
