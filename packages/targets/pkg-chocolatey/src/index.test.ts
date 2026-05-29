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

describe('chocolatey package generation', () => {
  it('writes a nuspec and an exe install script with checksum', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-choco-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({ outDir, version: '1.4.0' }) as any, {
      packageId: 'mytool',
      packageTitle: 'My Tool',
      authors: 'Acme',
      projectUrl: 'https://example.com/mytool',
      licenseUrl: 'https://example.com/license',
      tags: ['cli', 'release'],
      summary: 'A release tool',
      installerUrl: 'https://downloads.example.com/mytool-1.4.0.exe',
      installerType: 'exe',
      checksum: 'a'.repeat(64),
    });

    const dir = join(outDir, 'chocolatey', 'mytool');
    expect(result.artifact).toBe(dir);

    const nuspec = await readFile(join(dir, 'mytool.nuspec'), 'utf-8');
    expect(nuspec).toContain('<id>mytool</id>');
    expect(nuspec).toContain('<version>1.4.0</version>');
    expect(nuspec).toContain('<title>My Tool</title>');
    expect(nuspec).toContain('<authors>Acme</authors>');
    expect(nuspec).toContain('<projectUrl>https://example.com/mytool</projectUrl>');
    expect(nuspec).toContain('<tags>cli release</tags>');

    const install = await readFile(join(dir, 'tools', 'chocolateyinstall.ps1'), 'utf-8');
    expect(install).toContain("packageName    = 'mytool'");
    expect(install).toContain("fileType       = 'exe'");
    expect(install).toContain("url            = 'https://downloads.example.com/mytool-1.4.0.exe'");
    expect(install).toContain(`checksum       = '${'a'.repeat(64)}'`);
    expect(install).toContain("checksumType   = 'sha256'");
    expect(install).toContain("silentArgs     = '/S'");
    expect(install).toContain('Install-ChocolateyPackage @packageArgs');
  });

  it('escapes XML and emits a zip install script for zip installers', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-choco-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({ outDir, version: '2.0.0' }) as any, {
      packageId: 'ziptool',
      packageTitle: 'Zip & Tool <Pro>',
      installerUrl: 'https://downloads.example.com/ziptool-2.0.0.zip',
      installerType: 'zip',
      checksum: 'b'.repeat(64),
      checksumType: 'sha512',
    });

    const dir = join(outDir, 'chocolatey', 'ziptool');
    const nuspec = await readFile(join(dir, 'ziptool.nuspec'), 'utf-8');
    expect(nuspec).toContain('<title>Zip &amp; Tool &lt;Pro&gt;</title>');

    const install = await readFile(join(dir, 'tools', 'chocolateyinstall.ps1'), 'utf-8');
    expect(install).toContain('Install-ChocolateyZipPackage @packageArgs');
    expect(install).toContain("unzipLocation = $toolsDir");
    expect(install).toContain("checksumType  = 'sha512'");
  });

  it('keeps dry-run shipping side-effect free and surfaces the push commands', async () => {
    const ship = await adapter.ship(fakeShipContext({ version: '1.4.0', dryRun: true }) as any, {
      packageId: 'mytool',
      installerUrl: 'https://downloads.example.com/mytool-1.4.0.exe',
      checksum: 'c'.repeat(64),
    });
    expect(ship.id).toBe('dry-run');
    expect(ship.meta?.commands).toContain('choco push mytool.1.4.0.nupkg --source https://push.chocolatey.org/');
  });
});
