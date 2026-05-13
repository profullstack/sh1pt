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

describe('AUR package metadata generation', () => {
  it('writes PKGBUILD and .SRCINFO from release config', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-aur-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: 'v1.2.3-beta.1',
    }) as any, {
      pkgName: 'myapp-bin',
      maintainer: 'Example Maintainer <maintainer@example.com>',
      arch: ['x86_64', 'aarch64'],
      pkgdesc: 'Example desktop app',
      url: 'https://example.com/myapp',
      license: ['MIT'],
      depends: ['glibc'],
      optDepends: ['xdg-utils: open URLs from the app'],
      provides: ['myapp'],
      conflicts: ['myapp'],
      sourceUrl: 'https://downloads.example.com/myapp-1.2.3-beta.1.tar.gz',
      sourceSha256: 'a'.repeat(64),
      binaryName: 'myapp',
      installName: 'myapp',
    });

    expect(result.artifact).toBe(join(outDir, 'PKGBUILD'));

    const pkgbuild = await readFile(join(outDir, 'PKGBUILD'), 'utf-8');
    expect(pkgbuild).toContain('# Maintainer: Example Maintainer <maintainer@example.com>');
    expect(pkgbuild).toContain('pkgname=myapp-bin');
    expect(pkgbuild).toContain('pkgver=1.2.3_beta.1');
    expect(pkgbuild).toContain("pkgdesc='Example desktop app'");
    expect(pkgbuild).toContain("arch=('x86_64' 'aarch64')");
    expect(pkgbuild).toContain("depends=('glibc')");
    expect(pkgbuild).toContain("provides=('myapp')");
    expect(pkgbuild).toContain("conflicts=('myapp')");
    expect(pkgbuild).toContain("source=('https://downloads.example.com/myapp-1.2.3-beta.1.tar.gz')");
    expect(pkgbuild).toContain(`sha256sums=('${'a'.repeat(64)}')`);
    expect(pkgbuild).toContain('install -Dm755 "$srcdir/myapp" "$pkgdir/usr/bin/myapp"');

    const srcinfo = await readFile(join(outDir, '.SRCINFO'), 'utf-8');
    expect(srcinfo).toContain('pkgbase = myapp-bin');
    expect(srcinfo).toContain('\tpkgver = 1.2.3_beta.1');
    expect(srcinfo).toContain('\tarch = x86_64');
    expect(srcinfo).toContain('\tarch = aarch64');
    expect(srcinfo).toContain('\tdepends = glibc');
    expect(srcinfo).toContain('\toptdepends = xdg-utils: open URLs from the app');
    expect(srcinfo).toContain('pkgname = myapp-bin');
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      pkgName: 'myapp-bin',
    })).resolves.toEqual({ id: 'dry-run' });
  });
});
