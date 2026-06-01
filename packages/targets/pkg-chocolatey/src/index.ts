import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type InstallerType = 'zip' | 'exe' | 'msi' | 'portable';

interface ArchConfig {
  architecture: 'x64' | 'x86' | 'arm64';
  url: string;
  checksum: string;
  checksumType?: 'sha256' | 'sha512' | 'md5';
}

interface Config {
  packageId: string;           // e.g. "myapp"
  title?: string;
  authors?: string;
  projectUrl?: string;
  description?: string;
  tags?: string[];
  licenseUrl?: string;
  iconUrl?: string;
  releaseNotes?: string;
  installerType?: InstallerType;
  url?: string;                // single-arch download URL
  checksum?: string;
  checksumType?: 'sha256' | 'sha512' | 'md5';
  architectures?: ArchConfig[];
  silentArgs?: string;
  validExitCodes?: number[];
}

/** Validate a Chocolatey package ID: lowercase alphanumeric, hyphens, dots, underscores. */
function validatePackageId(id: string): void {
  if (!id || !/^[a-z0-9][a-z0-9._-]*$/.test(id)) {
    throw new Error(
      `pkg-chocolatey: invalid packageId "${id}". Must be lowercase alphanumeric with optional dots, hyphens, or underscores.`,
    );
  }
  if (id.includes('..') || id.includes('/') || id.includes('\\')) {
    throw new Error(`pkg-chocolatey: packageId "${id}" contains path traversal characters.`);
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderNuspec(ctx: { version: string }, config: Config): string {
  const version = ctx.version.replace(/^v/, '');
  const id = config.packageId;
  const title = config.title ?? id;
  const authors = config.authors ?? 'sh1pt';
  const description = config.description ?? `${title} release`;
  const tags = (config.tags ?? [id]).join(' ');

  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<package xmlns="http://schemas.microsoft.com/packaging/2015/06/nuspec.xsd">',
    '  <metadata>',
    `    <id>${escapeXml(id)}</id>`,
    `    <version>${escapeXml(version)}</version>`,
    `    <title>${escapeXml(title)}</title>`,
    `    <authors>${escapeXml(authors)}</authors>`,
    `    <description>${escapeXml(description)}</description>`,
    `    <tags>${escapeXml(tags)}</tags>`,
  ];

  if (config.projectUrl) lines.push(`    <projectUrl>${escapeXml(config.projectUrl)}</projectUrl>`);
  if (config.licenseUrl) lines.push(`    <licenseUrl>${escapeXml(config.licenseUrl)}</licenseUrl>`);
  if (config.iconUrl) lines.push(`    <iconUrl>${escapeXml(config.iconUrl)}</iconUrl>`);
  if (config.releaseNotes) lines.push(`    <releaseNotes>${escapeXml(config.releaseNotes)}</releaseNotes>`);

  lines.push('  </metadata>', '</package>', '');
  return lines.join('\n');
}

function renderInstallScript(config: Config): string {
  const installerType = config.installerType ?? 'zip';
  const silentArgs = config.silentArgs ?? (installerType === 'msi' ? '/quiet /norestart' : '/S');
  const validExitCodes = (config.validExitCodes ?? [0]).join(', ');
  const checksumType = config.checksumType ?? 'sha256';

  if (config.architectures?.length) {
    // Multi-arch install script
    const archBlocks = config.architectures.map((arch) => {
      const ct = arch.checksumType ?? checksumType;
      return [
        `  '${arch.architecture}' {`,
        `    $url = '${arch.url}'`,
        `    $checksum = '${arch.checksum}'`,
        `    $checksumType = '${ct}'`,
        `  }`,
      ].join('\n');
    });

    return [
      '$arch = if ([System.Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }',
      'switch ($arch) {',
      archBlocks.join('\n'),
      '}',
      '',
      `$packageArgs = @{`,
      `  packageName   = $env:ChocolateyPackageName`,
      `  unzipLocation = $toolsDir`,
      `  fileType      = '${installerType}'`,
      `  url64bit      = $url`,
      `  checksum64    = $checksum`,
      `  checksumType64 = $checksumType`,
      `  silentArgs    = '${silentArgs}'`,
      `  validExitCodes = @(${validExitCodes})`,
      `}`,
      ``,
      `Install-ChocolateyPackage @packageArgs`,
      ``,
    ].join('\n');
  }

  // Single-arch
  return [
    `$toolsDir = Split-Path -parent $MyInvocation.MyCommand.Definition`,
    `$packageArgs = @{`,
    `  packageName   = $env:ChocolateyPackageName`,
    `  unzipLocation = $toolsDir`,
    `  fileType      = '${installerType}'`,
    `  url64bit      = '${config.url ?? ''}'`,
    `  checksum64    = '${config.checksum ?? ''}'`,
    `  checksumType64 = '${checksumType}'`,
    `  silentArgs    = '${silentArgs}'`,
    `  validExitCodes = @(${validExitCodes})`,
    `}`,
    ``,
    `Install-ChocolateyPackage @packageArgs`,
    ``,
  ].join('\n');
}

export default defineTarget<Config>({
  id: 'pkg-chocolatey',
  kind: 'package-manager',
  label: 'Chocolatey Community Repository',

  async build(ctx, config) {
    validatePackageId(config.packageId);
    const version = ctx.version.replace(/^v/, '');
    const pkgDir = join(ctx.outDir, `${config.packageId}.${version}`);
    const toolsDir = join(pkgDir, 'tools');

    ctx.log(`generate Chocolatey package for ${config.packageId} v${version}`);
    await mkdir(toolsDir, { recursive: true });

    const nuspecPath = join(pkgDir, `${config.packageId}.nuspec`);
    const installPath = join(toolsDir, 'chocolateyInstall.ps1');

    await Promise.all([
      writeFile(nuspecPath, renderNuspec(ctx, config), 'utf-8'),
      writeFile(installPath, renderInstallScript(config), 'utf-8'),
    ]);

    ctx.log(`  wrote ${config.packageId}.nuspec`);
    ctx.log(`  wrote tools/chocolateyInstall.ps1`);

    return { artifact: pkgDir };
  },

  async ship(ctx, config) {
    validatePackageId(config.packageId);
    ctx.log(`choco push ${config.packageId} to Chocolatey Community Repository`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: run `choco pack ${packageId}.nuspec && choco push --source https://push.chocolatey.org`
    // Uses CHOCOLATEY_API_KEY from ctx.secret('CHOCOLATEY_API_KEY')
    return {
      id: `${config.packageId}@${ctx.version}`,
      url: `https://community.chocolatey.org/packages/${config.packageId}`,
    };
  },

  async status(id) {
    const [pkgId] = id.split('@');
    return { state: 'live', url: `https://community.chocolatey.org/packages/${pkgId}` };
  },

  setup: manualSetup({
    label: 'Chocolatey Community Repository',
    vendorDocUrl: 'https://docs.chocolatey.org/en-us/create/create-packages/',
    steps: [
      'Install Chocolatey: https://chocolatey.org/install',
      'Create a Chocolatey account at https://community.chocolatey.org/',
      'Generate an API key at https://community.chocolatey.org/account',
      'Run: sh1pt secret set CHOCOLATEY_API_KEY <your-api-key>',
      'sh1pt will build the .nuspec + install script and push to the community repo',
    ],
  }),
});
