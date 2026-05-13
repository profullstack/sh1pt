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

describe('winget manifest generation', () => {
  it('writes version, installer, and default locale manifests', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-winget-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: '1.2.3',
    }) as any, {
      packageId: 'Acme.MyTool',
      publisher: 'Acme',
      packageName: 'My Tool',
      shortDescription: 'A command-line release tool',
      homepage: 'https://example.com/my-tool',
      license: 'MIT',
      installerType: 'exe',
      installers: [
        {
          architecture: 'x64',
          url: 'https://downloads.example.com/my-tool-1.2.3-x64.exe',
          sha256: 'a'.repeat(64),
          scope: 'machine',
        },
        {
          architecture: 'arm64',
          url: 'https://downloads.example.com/my-tool-1.2.3-arm64.exe',
          sha256: 'b'.repeat(64),
        },
      ],
    });

    const manifestDir = join(outDir, 'manifests', 'a', 'Acme', 'MyTool', '1.2.3');
    expect(result.artifact).toBe(manifestDir);

    const versionManifest = await readFile(join(manifestDir, 'Acme.MyTool.yaml'), 'utf-8');
    expect(versionManifest).toContain('PackageIdentifier: "Acme.MyTool"');
    expect(versionManifest).toContain('PackageVersion: "1.2.3"');
    expect(versionManifest).toContain('ManifestType: version');

    const installerManifest = await readFile(join(manifestDir, 'Acme.MyTool.installer.yaml'), 'utf-8');
    expect(installerManifest).toContain('InstallerType: "exe"');
    expect(installerManifest).toContain('Architecture: "x64"');
    expect(installerManifest).toContain('Scope: "machine"');
    expect(installerManifest).toContain('Architecture: "arm64"');
    expect(installerManifest).toContain('ManifestType: installer');

    const localeManifest = await readFile(join(manifestDir, 'Acme.MyTool.locale.en-US.yaml'), 'utf-8');
    expect(localeManifest).toContain('Publisher: "Acme"');
    expect(localeManifest).toContain('PackageName: "My Tool"');
    expect(localeManifest).toContain('ShortDescription: "A command-line release tool"');
    expect(localeManifest).toContain('PackageUrl: "https://example.com/my-tool"');
    expect(localeManifest).toContain('License: "MIT"');
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      packageId: 'Acme.MyTool',
      installers: [
        {
          architecture: 'x64',
          url: 'https://downloads.example.com/my-tool-1.2.3-x64.exe',
          sha256: 'c'.repeat(64),
        },
      ],
    })).resolves.toEqual({ id: 'dry-run' });
  });
});
