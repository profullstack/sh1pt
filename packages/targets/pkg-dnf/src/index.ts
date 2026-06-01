import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Config {
  pkgName: string;             // RPM package name, e.g. "myapp"
  summary?: string;
  description?: string;
  license?: string;
  url?: string;
  releaseRepo?: string;        // GitHub repo for source URLs, e.g. "myorg/myapp"
  coprProject?: string;        // COPR project, e.g. "myuser/myapp"
  arch?: 'x86_64' | 'aarch64' | 'noarch';
  requires?: string[];
  buildRequires?: string[];
  sourceUrl?: string;
  sha256?: string;
}

/** Validate RPM package name: lowercase alphanumeric, hyphens, underscores, dots. */
function validatePkgName(name: string): void {
  if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/.test(name)) {
    throw new Error(`pkg-dnf: invalid pkgName "${name}". RPM names must be alphanumeric with hyphens, underscores, dots, or plus signs.`);
  }
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw new Error(`pkg-dnf: pkgName "${name}" contains path traversal characters.`);
  }
}

function rpmVersion(version: string): string {
  return version.replace(/^v/, '');
}

function defaultSourceUrl(config: Config, version: string): string {
  const repo = config.releaseRepo ?? config.coprProject?.split('/')[1] ?? config.pkgName;
  const org = config.coprProject?.split('/')[0] ?? 'profullstack';
  return `https://github.com/${org}/${repo}/releases/download/v${version}/${config.pkgName}-${version}-x86_64.tar.gz`;
}

function renderSpec(ctx: { version: string }, config: Config): string {
  const version = rpmVersion(ctx.version);
  const arch = config.arch ?? 'x86_64';
  const summary = config.summary ?? `${config.pkgName} release`;
  const description = config.description ?? summary;
  const license = config.license ?? 'MIT';
  const url = config.url ?? `https://github.com/${config.releaseRepo ?? config.pkgName}`;
  const source0 = config.sourceUrl ?? defaultSourceUrl(config, version);

  const lines = [
    `Name:           ${config.pkgName}`,
    `Version:        ${version}`,
    `Release:        1%{?dist}`,
    `Summary:        ${summary}`,
    `License:        ${license}`,
    `URL:            ${url}`,
    `Source0:        ${source0}`,
    `BuildArch:      ${arch}`,
    '',
  ];

  if (config.buildRequires?.length) {
    for (const r of config.buildRequires) lines.push(`BuildRequires:  ${r}`);
    lines.push('');
  }

  if (config.requires?.length) {
    for (const r of config.requires) lines.push(`Requires:       ${r}`);
    lines.push('');
  }

  lines.push(
    '%description',
    description,
    '',
    '%prep',
    '%autosetup -n %{name}-%{version}',
    '',
    '%install',
    'rm -rf $RPM_BUILD_ROOT',
    'mkdir -p $RPM_BUILD_ROOT/%{_bindir}',
    'install -m 755 %{name} $RPM_BUILD_ROOT/%{_bindir}/%{name}',
    '',
    '%files',
    '%{_bindir}/%{name}',
    '',
    '%changelog',
    `* $(date "+%a %b %d %Y") sh1pt <bot@sh1pt.com> - ${version}-1`,
    `- Release ${version}`,
    '',
  );

  return lines.join('\n');
}

export default defineTarget<Config>({
  id: 'pkg-dnf',
  kind: 'package-manager',
  label: 'Fedora COPR (RPM / dnf)',

  async build(ctx, config) {
    validatePkgName(config.pkgName);
    const version = rpmVersion(ctx.version);
    const specPath = join(ctx.outDir, `${config.pkgName}.spec`);
    ctx.log(`generate RPM spec for ${config.pkgName} v${version}`);
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(specPath, renderSpec(ctx, config), 'utf-8');
    ctx.log(`  wrote ${config.pkgName}.spec`);
    return { artifact: specPath };
  },

  async ship(ctx, config) {
    validatePkgName(config.pkgName);
    const coprProject = config.coprProject ?? `profullstack/${config.pkgName}`;
    ctx.log(`submit ${config.pkgName} to COPR project ${coprProject}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: POST to https://copr.fedorainfracloud.org/api_3/build/
    // with COPR_LOGIN + COPR_TOKEN from ctx.secret()
    return {
      id: `${config.pkgName}@${ctx.version}`,
      url: `https://copr.fedorainfracloud.org/coprs/${coprProject}/`,
    };
  },

  async status(id) {
    const [pkgName] = id.split('@');
    return { state: 'live', url: `https://copr.fedorainfracloud.org/coprs/search/?fulltext=${pkgName}` };
  },

  setup: manualSetup({
    label: 'Fedora COPR',
    vendorDocUrl: 'https://docs.pagure.org/copr.copr/user_documentation.html',
    steps: [
      'Create a Fedora account at https://accounts.fedoraproject.org/',
      'Create a COPR project at https://copr.fedorainfracloud.org/',
      'Generate API credentials at https://copr.fedorainfracloud.org/api/',
      'Run: sh1pt secret set COPR_LOGIN <your-login>',
      'Run: sh1pt secret set COPR_TOKEN <your-token>',
      'Run: sh1pt secret set COPR_PROJECT <user/project>',
    ],
  }),
});
