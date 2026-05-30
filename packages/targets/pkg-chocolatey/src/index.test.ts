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

describe('Chocolatey package generation', () => {
  it('writes a .nuspec and chocolateyInstall.ps1 from config', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-choco-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: 'v2.1.0',
    }) as any, {
      packageId: 'myapp',
      title: 'My App',
      authors: 'ACME Corp',
      owners: 'acmecorp',
      homepage: 'https://example.com',
      license: 'MIT',
      description: 'An example CLI tool',
      summary: 'CLI tool for doing things',
      tags: 'cli tool example',
      installerType: 'zip',
      releaseRepo: 'acme/myapp',
      installers: [
        { architecture: 'x64', url: 'https://github.com/acme/myapp/releases/download/v2.1.0/myapp-2.1.0-x64.zip', sha256: 'a'.repeat(64) },
      ],
    });

    expect(result.artifact).toBe(join(outDir, 'myapp.nuspec'));

    const nuspec = await readFile(join(outDir, 'myapp.nuspec'), 'utf-8');
    expect(nuspec).toContain('<id>myapp</id>');
    expect(nuspec).toContain('<version>2.1.0</version>');
    expect(nuspec).toContain('<title>My App</title>');
    expect(nuspec).toContain('<authors>ACME Corp</authors>');
    expect(nuspec).toContain('<owners>acmecorp</owners>');
    expect(nuspec).toContain('<projectUrl>https://example.com</projectUrl>');
    expect(nuspec).toContain('<description>An example CLI tool</description>');
    expect(nuspec).toContain('<tags>cli tool example</tags>');

    const installScript = await readFile(join(outDir, 'tools', 'chocolateyInstall.ps1'), 'utf-8');
    expect(installScript).toContain('https://github.com/acme/myapp/releases/download/v2.1.0/myapp-2.1.0-x64.zip');
    expect(installScript).toContain('a'.repeat(64));
    expect(installScript).toContain('Install-ChocolateyZipPackage');
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '2.1.0',
      dryRun: true,
    }) as any, {
      packageId: 'myapp',
    })).resolves.toEqual({ id: 'dry-run' });
  });
});
