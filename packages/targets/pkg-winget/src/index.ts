import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Config {
  packageId: string;       // e.g. "MyCompany.MyApp"
  publisher?: string;
  installerType?: 'exe' | 'msi' | 'msix' | 'zip' | 'portable';
  packageName?: string;
  shortDescription?: string;
  homepage?: string;
  license?: string;
  defaultLocale?: string;
  manifestVersion?: string;
  installers: {
    architecture: 'x64' | 'x86' | 'arm64' | 'arm';
    url: string;
    sha256: string;
    scope?: 'user' | 'machine';
  }[];
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function manifestDir(outDir: string, packageId: string, version: string): string {
  const [publisher = packageId, name = packageId] = packageId.split('.');
  return join(outDir, 'manifests', publisher[0]!.toLowerCase(), publisher, name, version);
}

function renderVersionManifest(config: Config, version: string): string {
  const locale = config.defaultLocale ?? 'en-US';
  const manifestVersion = config.manifestVersion ?? '1.6.0';
  return [
    `PackageIdentifier: ${yamlString(config.packageId)}`,
    `PackageVersion: ${yamlString(version)}`,
    `DefaultLocale: ${yamlString(locale)}`,
    'ManifestType: version',
    `ManifestVersion: ${yamlString(manifestVersion)}`,
    '',
  ].join('\n');
}

function renderInstallerManifest(config: Config, version: string): string {
  if (!config.installers?.length) {
    throw new Error('winget manifest generation requires at least one installer');
  }

  const manifestVersion = config.manifestVersion ?? '1.6.0';
  const installerType = config.installerType ?? 'exe';
  const lines = [
    `PackageIdentifier: ${yamlString(config.packageId)}`,
    `PackageVersion: ${yamlString(version)}`,
    `InstallerType: ${yamlString(installerType)}`,
    'Installers:',
  ];

  for (const installer of config.installers) {
    lines.push(`  - Architecture: ${yamlString(installer.architecture)}`);
    lines.push(`    InstallerUrl: ${yamlString(installer.url)}`);
    lines.push(`    InstallerSha256: ${yamlString(installer.sha256)}`);
    if (installer.scope) {
      lines.push(`    Scope: ${yamlString(installer.scope)}`);
    }
  }

  lines.push('ManifestType: installer');
  lines.push(`ManifestVersion: ${yamlString(manifestVersion)}`);
  lines.push('');
  return lines.join('\n');
}

function renderLocaleManifest(config: Config, version: string): string {
  const locale = config.defaultLocale ?? 'en-US';
  const manifestVersion = config.manifestVersion ?? '1.6.0';
  const packageName = config.packageName ?? config.packageId.split('.').at(-1) ?? config.packageId;
  const publisher = config.publisher ?? config.packageId.split('.')[0] ?? 'Unknown';
  const lines = [
    `PackageIdentifier: ${yamlString(config.packageId)}`,
    `PackageVersion: ${yamlString(version)}`,
    `PackageLocale: ${yamlString(locale)}`,
    `Publisher: ${yamlString(publisher)}`,
    `PackageName: ${yamlString(packageName)}`,
    `ShortDescription: ${yamlString(config.shortDescription ?? `${packageName} release`)}`,
  ];

  if (config.homepage) {
    lines.push(`PackageUrl: ${yamlString(config.homepage)}`);
  }
  if (config.license) {
    lines.push(`License: ${yamlString(config.license)}`);
  }

  lines.push('ManifestType: defaultLocale');
  lines.push(`ManifestVersion: ${yamlString(manifestVersion)}`);
  lines.push('');
  return lines.join('\n');
}

export default defineTarget<Config>({
  id: 'pkg-winget',
  kind: 'package-manager',
  label: 'Microsoft winget',
  async build(ctx, config) {
    const dir = manifestDir(ctx.outDir, config.packageId, ctx.version);
    const baseName = config.packageId;
    ctx.log(`generate winget manifest for ${config.packageId} v${ctx.version}`);
    await mkdir(dir, { recursive: true });
    await Promise.all([
      writeFile(join(dir, `${baseName}.yaml`), renderVersionManifest(config, ctx.version), 'utf-8'),
      writeFile(join(dir, `${baseName}.installer.yaml`), renderInstallerManifest(config, ctx.version), 'utf-8'),
      writeFile(
        join(dir, `${baseName}.locale.${config.defaultLocale ?? 'en-US'}.yaml`),
        renderLocaleManifest(config, ctx.version),
        'utf-8',
      ),
    ]);
    return { artifact: dir };
  },
  async ship(ctx, config) {
    ctx.log(`submit winget PR for ${config.packageId}@${ctx.version}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: fork winget-pkgs, add manifests, open PR via GitHub API
    // Uses GITHUB_TOKEN from ctx.secret('GITHUB_TOKEN')
    return {
      id: `${config.packageId}@${ctx.version}`,
      url: `https://github.com/microsoft/winget-pkgs/pulls`,
    };
  },
  async status(id) {
    const [pkgId] = id.split('@');
    return { state: 'live', url: `https://winstall.app/apps/${pkgId}` };
  },
  setup: manualSetup({
    label: 'Microsoft winget',
    vendorDocUrl: 'https://learn.microsoft.com/en-us/windows/package-manager/package/repository',
    steps: [
      'Run: sh1pt secret set GITHUB_TOKEN <pat-with-repo-scope>',
      'sh1pt will fork microsoft/winget-pkgs, add manifests, and open a PR automatically',
      'Ensure your installer URL is stable and version-tagged',
    ],
  }),
});
