import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Config {
  packageId: string;            // e.g. "mytool" (lowercase, the community-repo id)
  packageTitle?: string;        // human title, e.g. "My Tool"
  authors?: string;             // defaults to packageId
  owners?: string;
  projectUrl?: string;          // homepage
  licenseUrl?: string;
  iconUrl?: string;
  tags?: string[];
  summary?: string;
  description?: string;
  installerUrl: string;         // download URL for the installer/zip
  installerType?: 'exe' | 'msi' | 'zip';
  checksum: string;             // checksum of the installer at installerUrl
  checksumType?: 'sha256' | 'sha512';
  silentArgs?: string;          // override the default silent-install args
}

const TYPE_DEFAULT_SILENT_ARGS: Record<NonNullable<Config['installerType']>, string> = {
  exe: '/S',
  msi: '/qn /norestart',
  zip: '',
};

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function packageDir(outDir: string, packageId: string): string {
  return join(outDir, 'chocolatey', packageId);
}

function silentArgsFor(config: Config): string {
  return config.silentArgs ?? TYPE_DEFAULT_SILENT_ARGS[config.installerType ?? 'exe'];
}

function renderNuspec(config: Config, version: string): string {
  const authors = config.authors ?? config.packageId;
  const title = config.packageTitle ?? config.packageId;
  const summary = config.summary ?? `${title} release`;
  const description = config.description ?? summary;
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<package xmlns="http://schemas.microsoft.com/packaging/2015/06/nuspec.xsd">',
    '  <metadata>',
    `    <id>${xmlEscape(config.packageId)}</id>`,
    `    <version>${xmlEscape(version)}</version>`,
    `    <title>${xmlEscape(title)}</title>`,
    `    <authors>${xmlEscape(authors)}</authors>`,
    `    <owners>${xmlEscape(config.owners ?? authors)}</owners>`,
  ];
  if (config.projectUrl) lines.push(`    <projectUrl>${xmlEscape(config.projectUrl)}</projectUrl>`);
  if (config.licenseUrl) lines.push(`    <licenseUrl>${xmlEscape(config.licenseUrl)}</licenseUrl>`);
  if (config.iconUrl) lines.push(`    <iconUrl>${xmlEscape(config.iconUrl)}</iconUrl>`);
  lines.push(`    <summary>${xmlEscape(summary)}</summary>`);
  lines.push(`    <description>${xmlEscape(description)}</description>`);
  if (config.tags?.length) lines.push(`    <tags>${xmlEscape(config.tags.join(' '))}</tags>`);
  lines.push('  </metadata>');
  lines.push('  <files>');
  lines.push('    <file src="tools\\**" target="tools" />');
  lines.push('  </files>');
  lines.push('</package>');
  lines.push('');
  return lines.join('\n');
}

// Escape a value for a single-quoted PowerShell string literal: a literal '
// must be doubled ('') or it terminates the string and breaks the .ps1.
function psEscape(value: string): string {
  return value.replace(/'/g, "''");
}

function renderInstallScript(config: Config): string {
  const type = config.installerType ?? 'exe';
  const checksumType = config.checksumType ?? 'sha256';
  if (type === 'zip') {
    return [
      `$ErrorActionPreference = 'Stop'`,
      `$toolsDir   = Split-Path -Parent $MyInvocation.MyCommand.Definition`,
      `$packageArgs = @{`,
      `  packageName   = '${psEscape(config.packageId)}'`,
      `  unzipLocation = $toolsDir`,
      `  url           = '${psEscape(config.installerUrl)}'`,
      `  checksum      = '${psEscape(config.checksum)}'`,
      `  checksumType  = '${checksumType}'`,
      `}`,
      `Install-ChocolateyZipPackage @packageArgs`,
      '',
    ].join('\n');
  }
  return [
    `$ErrorActionPreference = 'Stop'`,
    `$packageArgs = @{`,
    `  packageName    = '${psEscape(config.packageId)}'`,
    `  fileType       = '${type}'`,
    `  url            = '${psEscape(config.installerUrl)}'`,
    `  checksum       = '${psEscape(config.checksum)}'`,
    `  checksumType   = '${checksumType}'`,
    `  silentArgs     = '${psEscape(silentArgsFor(config))}'`,
    `  validExitCodes = @(0)`,
    `}`,
    `Install-ChocolateyPackage @packageArgs`,
    '',
  ].join('\n');
}

function publishCommands(config: Config, version: string): string[] {
  return [
    `choco pack ${config.packageId}.nuspec --version ${version}`,
    `choco apikey --api-key <CHOCOLATEY_API_KEY> --source https://push.chocolatey.org/`,
    `choco push ${config.packageId}.${version}.nupkg --source https://push.chocolatey.org/`,
  ];
}

export default defineTarget<Config>({
  id: 'pkg-chocolatey',
  kind: 'package-manager',
  label: 'Chocolatey Community Repository',
  async build(ctx, config) {
    if (!config.installerUrl) throw new Error('pkg-chocolatey requires installerUrl');
    if (!config.checksum) throw new Error('pkg-chocolatey requires checksum (the community repo rejects un-checksummed remote downloads)');
    const dir = packageDir(ctx.outDir, config.packageId);
    const toolsDir = join(dir, 'tools');
    ctx.log(`generate chocolatey package for ${config.packageId} v${ctx.version}`);
    await mkdir(toolsDir, { recursive: true });
    await Promise.all([
      writeFile(join(dir, `${config.packageId}.nuspec`), renderNuspec(config, ctx.version), 'utf-8'),
      writeFile(join(toolsDir, 'chocolateyinstall.ps1'), renderInstallScript(config), 'utf-8'),
    ]);
    return {
      artifact: dir,
      meta: {
        nuspec: join(dir, `${config.packageId}.nuspec`),
        installScript: join(toolsDir, 'chocolateyinstall.ps1'),
        commands: publishCommands(config, ctx.version),
      },
    };
  },
  async ship(ctx, config) {
    ctx.log(`push ${config.packageId}@${ctx.version} to community.chocolatey.org`);
    if (ctx.dryRun) {
      return { id: 'dry-run', meta: { commands: publishCommands(config, ctx.version) } };
    }
    // Live publish (choco pack + choco push) is not implemented yet — fail
    // loudly rather than return a false success. Needs Windows + the choco CLI
    // and CHOCOLATEY_API_KEY in the vault.
    throw new Error(
      'pkg-chocolatey live publish is not implemented yet — use dryRun to preview ' +
      'the choco pack/push commands. (Requires Windows + choco CLI + CHOCOLATEY_API_KEY.)',
    );
  },
  async status(id) {
    const [pkgId] = id.split('@');
    return { state: 'in-review', url: `https://community.chocolatey.org/packages/${pkgId}` };
  },
  setup: manualSetup({
    label: 'Chocolatey Community Repository',
    vendorDocUrl: 'https://docs.chocolatey.org/en-us/create/create-packages/',
    steps: [
      'Create an account at https://community.chocolatey.org and confirm your email.',
      'Copy your API key from https://community.chocolatey.org/account',
      'Run: sh1pt secret set CHOCOLATEY_API_KEY <key>',
      'Packaging + push require Windows with the choco CLI installed (choco pack / choco push).',
      'Note: community submissions pass through automated validation, verification, and VirusTotal scanning before they go live.',
    ],
  }),
});
