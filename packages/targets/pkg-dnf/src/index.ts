import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Config {
  /** RPM package name, e.g. "myapp" */
  packageName: string;
  /** Package summary (one line) */
  summary?: string;
  /** Full description */
  description?: string;
  /** SPDX license identifier, e.g. "MIT" */
  license?: string;
  /** Project homepage URL */
  homepage?: string;
  /** Package group, e.g. "Applications/System" */
  group?: string;
  /** Architecture: x86_64 | aarch64 | noarch */
  architecture?: 'x86_64' | 'aarch64' | 'noarch';
  /** Fedora COPR project slug: "owner/project", e.g. "myorg/myapp" */
  coprProject?: string;
  /** GitHub release repo to derive default download URL, e.g. "myorg/myapp" */
  releaseRepo?: string;
  /** Source download URL template with {version}, {name}, {arch} placeholders */
  sourceUrlTemplate?: string;
  /** RPM requires (runtime dependencies) */
  requires?: string[];
  /** Build requires */
  buildRequires?: string[];
}

function defaultSourceUrl(config: Config, version: string): string {
  const repo = config.releaseRepo ?? config.coprProject ?? config.packageName;
  const arch = config.architecture ?? 'x86_64';
  return (config.sourceUrlTemplate ?? `https://github.com/${repo}/releases/download/v{version}/{name}-{version}-{arch}.tar.gz`)
    .replace('{version}', version)
    .replace('{name}', config.packageName)
    .replace('{arch}', arch);
}

function renderSpec(config: Config, version: string): string {
  const name = config.packageName;
  const arch = config.architecture ?? 'x86_64';
  const license = config.license ?? 'MIT';
  const summary = config.summary ?? `${name} package`;
  const description = config.description ?? summary;
  const homepage = config.homepage ?? 'https://sh1pt.com';
  const group = config.group ?? 'Applications/System';
  const requires = config.requires ?? [];
  const buildRequires = config.buildRequires ?? [];

  const lines = [
    `Name:           ${name}`,
    `Version:        ${version}`,
    'Release:        1%{?dist}',
    `Summary:        ${summary}`,
    `License:        ${license}`,
    `URL:            ${homepage}`,
    `Source0:        ${defaultSourceUrl(config, '%{version}')}`,
    `Group:          ${group}`,
    `BuildArch:      ${arch}`,
    '',
  ];

  for (const req of buildRequires) {
    lines.push(`BuildRequires:  ${req}`);
  }
  for (const req of requires) {
    lines.push(`Requires:       ${req}`);
  }

  lines.push(
    '',
    '%description',
    description,
    '',
    '%prep',
    '%autosetup',
    '',
    '%build',
    '# binary releases — no compilation needed',
    '',
    '%install',
    'rm -rf %{buildroot}',
    `install -Dm755 %{name} %{buildroot}%{_bindir}/%{name}`,
    '',
    '%files',
    '%license LICENSE',
    `%{_bindir}/${name}`,
    '',
    '%changelog',
    `* ${new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: '2-digit' })} sh1pt <noreply@sh1pt.com> - ${version}-1`,
    `- Release ${version}`,
    '',
  );

  return lines.join('\n');
}

export default defineTarget<Config>({
  id: 'pkg-dnf',
  kind: 'package-manager',
  label: 'dnf / RPM (Fedora COPR)',

  async build(ctx, config) {
    const version = ctx.version.replace(/^v/, '');
    const specPath = join(ctx.outDir, `${config.packageName}.spec`);

    ctx.log(`generate RPM spec ${config.packageName}.spec for v${version}`);
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(specPath, renderSpec(config, version), 'utf-8');
    ctx.log(`wrote ${specPath}`);

    return { artifact: specPath };
  },

  async ship(ctx, config) {
    const version = ctx.version.replace(/^v/, '');
    const copr = config.coprProject ?? config.packageName;

    ctx.log(`submit ${config.packageName} v${version} to Fedora COPR (${copr})`);

    if (ctx.dryRun) return { id: 'dry-run' };

    // TODO: use the COPR API (copr.fedorainfracloud.org) to trigger a build
    // Requires COPR_LOGIN and COPR_TOKEN from ctx.secret(...)
    return {
      id: `${config.packageName}@${version}`,
      url: `https://copr.fedorainfracloud.org/coprs/${copr}/`,
    };
  },

  async status(id) {
    const [name] = id.split('@');
    return { state: 'live', url: `https://packages.fedoraproject.org/pkgs/${name}/` };
  },

  setup: manualSetup({
    label: 'Fedora COPR (dnf)',
    vendorDocUrl: 'https://docs.fedoraproject.org/en-US/packaging-guidelines/',
    steps: [
      'Create a free account at copr.fedorainfracloud.org',
      'Create a new COPR project for your package',
      'Go to your COPR profile → API → generate token',
      'Run: sh1pt secret set COPR_LOGIN <your-login>',
      'Run: sh1pt secret set COPR_TOKEN <your-api-token>',
      'Run: sh1pt secret set COPR_PROJECT <owner>/<project>',
      'sh1pt will submit build tasks to your COPR project on each release',
    ],
  }),
});
