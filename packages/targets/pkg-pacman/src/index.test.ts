import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { execFileSync } from 'node:child_process';
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

describe('pacman PKGBUILD generation', () => {
  it('writes a valid PKGBUILD with normalized pkgver and a pacman.conf snippet', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-pacman-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({ outDir, version: 'v1.5.0-rc1' }) as any, {
      pkgname: 'myapp',
      pkgdesc: 'My App',
      url: 'https://example.com/myapp',
      license: ['MIT'],
      depends: ['glibc'],
      makedepends: ['git'],
      sourceUrl: 'https://example.com/myapp-1.5.0.tar.gz',
      sha256sum: 'a'.repeat(64),
      repoName: 'sovereign',
    });

    const pkgbuildPath = join(outDir, 'pacman', 'PKGBUILD');
    expect(result.artifact).toBe(pkgbuildPath);

    const pkgbuild = await readFile(pkgbuildPath, 'utf-8');
    expect(pkgbuild).toContain('pkgname=myapp');
    // pacman pkgver may not contain '-' or ':' — normalized to '_'.
    expect(pkgbuild).toContain('pkgver=1.5.0_rc1');
    expect(pkgbuild).toContain('pkgrel=1');
    expect(pkgbuild).toContain("arch=('x86_64')");
    expect(pkgbuild).toContain("license=('MIT')");
    expect(pkgbuild).toContain("depends=('glibc')");
    expect(pkgbuild).toContain('source=("$pkgname-$pkgver.tar.gz::https://example.com/myapp-1.5.0.tar.gz")');
    expect(pkgbuild).toContain(`sha256sums=('${'a'.repeat(64)}')`);
    expect(pkgbuild).toContain('package() {');

    const conf = await readFile(join(outDir, 'pacman', 'sovereign.pacman.conf'), 'utf-8');
    expect(conf).toContain('[sovereign]');
    expect(conf).toContain('Server = ');
  });

  it('escapes shell metacharacters in pkgdesc and defaults source to SKIP', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-pacman-'));
    tempDirs.push(outDir);

    await adapter.build(fakeBuildContext({ outDir, version: '2.0.0' }) as any, {
      pkgname: 'myapp',
      pkgdesc: 'Has "quotes" and $VARS and `backticks`',
    });

    const pkgbuild = await readFile(join(outDir, 'pacman', 'PKGBUILD'), 'utf-8');
    // Double-quote, $ and backtick are escaped so the bash PKGBUILD stays valid.
    expect(pkgbuild).toContain('pkgdesc="Has \\"quotes\\" and \\$VARS and \\`backticks\\`"');
    // No source provided -> empty arrays, not a broken reference.
    expect(pkgbuild).toContain('source=()');
    expect(pkgbuild).toContain('sha256sums=()');
  });

  it('keeps dry-run shipping side-effect free; live publish throws not-implemented', async () => {
    const ship = await adapter.ship(fakeShipContext({ version: '1.5.0', dryRun: true }) as any, {
      pkgname: 'myapp',
      repoName: 'sovereign',
    });
    expect(ship.id).toBe('dry-run');
    expect((ship.meta?.commands as string[])?.some((c) => c.startsWith('repo-add'))).toBe(true);

    await expect(adapter.ship(fakeShipContext({ version: '1.5.0', dryRun: false }) as any, {
      pkgname: 'myapp',
    })).rejects.toThrow(/PACMAN_GPG_KEY|not implemented/i);
  });

  it('generates syntactically valid bash (bash -n) even with hostile field values', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-pacman-'));
    tempDirs.push(outDir);

    await adapter.build(fakeBuildContext({ outDir, version: '1.0.0' }) as any, {
      pkgname: 'myapp',
      pkgdesc: 'evil"; rm -rf /; echo "$(whoami)` `',
      url: 'https://x.test/$(id)`uname`',
      sha256sum: "ab'cd",
    });

    // bash -n parses without executing — proves the generated PKGBUILD is valid bash.
    const out = execFileSync('bash', ['-n', join(outDir, 'pacman', 'PKGBUILD')], { encoding: 'utf-8', stdio: 'pipe' });
    expect(out).toBe('');
  });

  it('rejects pkgname / repoName that would break the PKGBUILD or pacman.conf', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-pacman-'));
    tempDirs.push(outDir);

    await expect(adapter.build(fakeBuildContext({ outDir, version: '1.0.0' }) as any, {
      pkgname: 'bad name; rm -rf /',
    })).rejects.toThrow(/invalid pkgname/i);

    await expect(adapter.build(fakeBuildContext({ outDir, version: '1.0.0' }) as any, {
      pkgname: 'myapp',
      repoName: 'evil]\n[core',
    })).rejects.toThrow(/invalid repoName/i);
  });
});
