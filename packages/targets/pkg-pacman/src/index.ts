import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Config {
  pkgName: string;              // AUR package name, e.g. "myapp-bin"
  pkgdesc?: string;
  url?: string;
  license?: string[];
  arch?: ('x86_64' | 'aarch64' | 'any')[];
  depends?: string[];
  makedepends?: string[];
  provides?: string[];
  conflicts?: string[];
  releaseRepo?: string;         // GitHub org/repo for source URLs
  sourceUrl?: string;           // explicit source URL override
  sha256sum?: string;
  install?: string;             // optional .install script name
}

/** Validate AUR package name */
function validatePkgName(name: string): void {
  if (!name || !/^[a-z0-9][a-z0-9_.-]*$/.test(name) || /[;`$<>&|\\]/.test(name)) {
    throw new Error(`pkg-pacman: invalid pkgName "${name}"`);
  }
}

function bashArray(values: string[]): string {
  return `(${values.map(v => `'${v}'`).join(' ')})`;
}

function aurVersion(version: string): string {
  return version.replace(/^v/, '');
}

function defaultSourceUrl(config: Config, version: string): string {
  const repo = config.releaseRepo ?? config.pkgName.replace(/-bin$/, '');
  return `https://github.com/${repo}/releases/download/v${version}/${config.pkgName}-${version}-x86_64.tar.gz`;
}

function renderPKGBUILD(ctx: { version: string }, config: Config): string {
  const pkgver = aurVersion(ctx.version);
  const arch = config.arch ?? ['x86_64'];
  const license = config.license ?? ['MIT'];
  const sourceUrl = config.sourceUrl ?? defaultSourceUrl(config, pkgver);
  const sha256sum = config.sha256sum ?? 'SKIP';

  const lines = [
    `# Maintainer: sh1pt bot <bot@sh1pt.com>`,
    `pkgname='${config.pkgName}'`,
    `pkgver='${pkgver}'`,
    `pkgrel=1`,
    `pkgdesc='${(config.pkgdesc ?? config.pkgName + ' release').replace(/'/g, "\\'")}'`,
    `url='${config.url ?? 'https://sh1pt.com'}'`,
    `arch=${bashArray(arch)}`,
    `license=${bashArray(license)}`,
  ];

  if (config.depends?.length) lines.push(`depends=${bashArray(config.depends)}`);
  if (config.makedepends?.length) lines.push(`makedepends=${bashArray(config.makedepends)}`);
  if (config.provides?.length) lines.push(`provides=${bashArray(config.provides)}`);
  if (config.conflicts?.length) lines.push(`conflicts=${bashArray(config.conflicts)}`);

  lines.push(
    `source=("${config.pkgName}-\${pkgver}.tar.gz::${sourceUrl}")`,
    `sha256sums=('${sha256sum}')`,
    '',
    'package() {',
    `  install -Dm755 "\${pkgname}" "\${pkgdir}/usr/bin/\${pkgname}"`,
    '}',
    '',
  );

  return lines.join('\n');
}

function renderSRCINFO(ctx: { version: string }, config: Config): string {
  const pkgver = aurVersion(ctx.version);
  const arch = config.arch ?? ['x86_64'];
  const license = config.license ?? ['MIT'];
  const sourceUrl = config.sourceUrl ?? defaultSourceUrl(config, pkgver);
  const sha256sum = config.sha256sum ?? 'SKIP';

  const lines = [
    `pkgbase = ${config.pkgName}`,
    `\tpkgdesc = ${config.pkgdesc ?? config.pkgName + ' release'}`,
    `\tpkgver = ${pkgver}`,
    `\tpkgrel = 1`,
    `\turl = ${config.url ?? 'https://sh1pt.com'}`,
    ...arch.map(a => `\tarch = ${a}`),
    ...license.map(l => `\tlicense = ${l}`),
    ...(config.depends ?? []).map(d => `\tdepends = ${d}`),
    ...(config.makedepends ?? []).map(d => `\tmakedepends = ${d}`),
    ...(config.provides ?? []).map(p => `\tprovides = ${p}`),
    ...(config.conflicts ?? []).map(c => `\tconflicts = ${c}`),
    `\tsource = ${config.pkgName}-${pkgver}.tar.gz::${sourceUrl}`,
    `\tsha256sums = ${sha256sum}`,
    '',
    `pkgname = ${config.pkgName}`,
    '',
  ];

  return lines.join('\n');
}

export default defineTarget<Config>({
  id: 'pkg-pacman',
  kind: 'package-manager',
  label: 'AUR (Arch Linux)',

  async build(ctx, config) {
    validatePkgName(config.pkgName);
    const pkgDir = join(ctx.outDir, config.pkgName);
    ctx.log(`generate PKGBUILD + .SRCINFO for ${config.pkgName} v${aurVersion(ctx.version)}`);
    await mkdir(pkgDir, { recursive: true });

    await Promise.all([
      writeFile(join(pkgDir, 'PKGBUILD'), renderPKGBUILD(ctx, config), 'utf-8'),
      writeFile(join(pkgDir, '.SRCINFO'), renderSRCINFO(ctx, config), 'utf-8'),
    ]);

    ctx.log('  wrote PKGBUILD + .SRCINFO');
    return { artifact: pkgDir };
  },

  async ship(ctx, config) {
    validatePkgName(config.pkgName);
    ctx.log(`push ${config.pkgName} to AUR`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: git push to aur.archlinux.org/${pkgName}.git
    // Uses AUR_SSH_KEY from ctx.secret('AUR_SSH_KEY')
    return {
      id: `${config.pkgName}@${ctx.version}`,
      url: `https://aur.archlinux.org/packages/${config.pkgName}`,
    };
  },

  async status(id) {
    const [pkgName] = id.split('@');
    return { state: 'live', url: `https://aur.archlinux.org/packages/${pkgName}` };
  },

  setup: manualSetup({
    label: 'AUR (Arch User Repository)',
    vendorDocUrl: 'https://wiki.archlinux.org/title/AUR_submission_guidelines',
    steps: [
      'Create an AUR account at https://aur.archlinux.org/register/',
      'Generate an SSH key pair and add the public key to your AUR account',
      'Run: sh1pt secret set AUR_SSH_KEY "$(cat ~/.ssh/id_rsa)"',
      'Create the AUR package repo: ssh aur@aur.archlinux.org setup-repo <pkgname>',
      'sh1pt will push PKGBUILD + .SRCINFO on each release',
    ],
  }),
});
