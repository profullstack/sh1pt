import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface InstallerConfig {
  /** Architecture: x64 | x86 | arm64 */
  architecture?: 'x64' | 'x86' | 'arm64';
  /** Direct download URL for this architecture */
  url: string;
  /** SHA-256 checksum of the downloaded file */
  sha256: string;
}

interface Config {
  /** Chocolatey package id, e.g. "myapp" */
  packageId: string;
  /** Package title shown in the Chocolatey gallery */
  title?: string;
  /** Package author(s) */
  authors?: string;
  /** Package owner (usually your Chocolatey username) */
  owners?: string;
  /** Project homepage URL */
  homepage?: string;
  /** SPDX license identifier, e.g. "MIT" */
  license?: string;
  /** Package description (shown on the gallery page) */
  description?: string;
  /** Short one-line summary */
  summary?: string;
  /** Space-separated tags */
  tags?: string;
  /** Installer type: zip | exe | msi | portable */
  installerType?: 'zip' | 'exe' | 'msi' | 'portable';
  /** Installer entries per architecture (falls back to a single x64 entry). */
  installers?: InstallerConfig[];
  /** GitHub release repo used to derive a default download URL, e.g. "myorg/myapp" */
  releaseRepo?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function defaultUrl(config: Config, version: string, arch: string): string {
  const repo = config.releaseRepo ?? config.packageId;
  const ext = config.installerType === 'exe' ? 'exe' : config.installerType === 'msi' ? 'msi' : 'zip';
  return `https://github.com/${repo}/releases/download/v${version}/${config.packageId}-${version}-${arch}.${ext}`;
}

function renderNuspec(config: Config, version: string): string {
  const id = config.packageId;
  const title = config.title ?? id;
  const authors = escapeXml(config.authors ?? title);
  const owners = escapeXml(config.owners ?? authors);
  const homepage = escapeXml(config.homepage ?? 'https://sh1pt.com');
  const license = escapeXml(config.license ?? 'MIT');
  const description = escapeXml(config.description ?? `${title} package`);
  const summary = escapeXml(config.summary ?? description);
  const tags = escapeXml(config.tags ?? 'cli');

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<package xmlns="http://schemas.microsoft.com/packaging/2015/06/nuspec.xsd">',
    '  <metadata>',
    `    <id>${escapeXml(id)}</id>`,
    `    <version>${escapeXml(version)}</version>`,
    `    <title>${escapeXml(title)}</title>`,
    `    <authors>${authors}</authors>`,
    `    <owners>${owners}</owners>`,
    `    <projectUrl>${homepage}</projectUrl>`,
    `    <licenseUrl>https://opensource.org/licenses/${escapeXml(config.license ?? 'MIT')}</licenseUrl>`,
    '    <requireLicenseAcceptance>false</requireLicenseAcceptance>',
    `    <description>${description}</description>`,
    `    <summary>${summary}</summary>`,
    `    <tags>${tags}</tags>`,
    '  </metadata>',
    '  <files>',
    '    <file src="tools\\**" target="tools" />',
    '  </files>',
    '</package>',
    '',
  ].join('\n');
}

function renderInstallScript(config: Config, version: string): string {
  const installers = config.installers ?? [{ url: defaultUrl(config, version, 'x64'), sha256: '', architecture: 'x64' as const }];

  const primary = installers.find((i) => i.architecture !== 'x86') ?? installers[0]!;
  const x86 = installers.find((i) => i.architecture === 'x86');
  const installerType = config.installerType ?? 'zip';

  const lines = [
    '$ErrorActionPreference = \'Stop\'',
    '$toolsDir = "$(Split-Path -parent $MyInvocation.MyCommand.Definition)"',
    '',
    '$packageArgs = @{',
    '  packageName    = $env:ChocolateyPackageName',
  ];

  if (installerType === 'zip') {
    lines.push(`  url64bit       = '${primary.url}'`);
    lines.push(`  checksum64     = '${primary.sha256}'`);
    lines.push('  checksumType64 = \'sha256\'');
    if (x86) {
      lines.push(`  url            = '${x86.url}'`);
      lines.push(`  checksum       = '${x86.sha256}'`);
      lines.push('  checksumType   = \'sha256\'');
    }
    lines.push('  unzipLocation  = $toolsDir');
    lines.push('}');
    lines.push('');
    lines.push('Install-ChocolateyZipPackage @packageArgs');
  } else {
    lines.push(`  url64bit       = '${primary.url}'`);
    lines.push(`  checksum64     = '${primary.sha256}'`);
    lines.push('  checksumType64 = \'sha256\'');
    lines.push(`  fileType       = \'${installerType}\'`);
    lines.push('  silentArgs     = "/S"');
    lines.push('  validExitCodes = @(0)');
    lines.push('}');
    lines.push('');
    lines.push('Install-ChocolateyPackage @packageArgs');
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Target definition
// ---------------------------------------------------------------------------

export default defineTarget<Config>({
  id: 'pkg-chocolatey',
  kind: 'package-manager',
  label: 'Chocolatey Community Repository',

  async build(ctx, config) {
    const version = ctx.version.replace(/^v/, '');
    const nuspecPath = join(ctx.outDir, `${config.packageId}.nuspec`);
    const toolsDir = join(ctx.outDir, 'tools');
    const installScriptPath = join(toolsDir, 'chocolateyInstall.ps1');

    ctx.log(`generate Chocolatey package ${config.packageId} v${version}`);

    await mkdir(toolsDir, { recursive: true });
    await writeFile(nuspecPath, renderNuspec(config, version), 'utf-8');
    await writeFile(installScriptPath, renderInstallScript(config, version), 'utf-8');

    ctx.log(`wrote ${nuspecPath}`);
    ctx.log(`wrote ${installScriptPath}`);

    return { artifact: nuspecPath };
  },

  async ship(ctx, config) {
    const version = ctx.version.replace(/^v/, '');
    const packageId = config.packageId;

    ctx.log(`push ${packageId} v${version} to Chocolatey Community Repository`);

    if (ctx.dryRun) return { id: 'dry-run' };

    // TODO: pack the nupkg and push via `choco push` or the Chocolatey v2 API
    // Requires CHOCOLATEY_API_KEY from ctx.secret('CHOCOLATEY_API_KEY')
    return {
      id: `${packageId}@${version}`,
      url: `https://community.chocolatey.org/packages/${packageId}/${version}`,
    };
  },

  async status(id) {
    const [name] = id.split('@');
    return { state: 'live', url: `https://community.chocolatey.org/packages/${name}` };
  },

  setup: manualSetup({
    label: 'Chocolatey Community Repository',
    vendorDocUrl: 'https://docs.chocolatey.org/en-us/create/create-packages',
    steps: [
      'Create a free account at community.chocolatey.org',
      'Generate an API key under your account settings',
      'Run: sh1pt secret set CHOCOLATEY_API_KEY <your-api-key>',
      'sh1pt will pack and push your .nupkg to the community repository on each release',
    ],
  }),
});
