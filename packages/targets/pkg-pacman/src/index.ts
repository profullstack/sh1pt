import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Config {
  /** Package name in the AUR / Pacman repo */
  pkgname: string;
  /** Package description */
  pkgdesc?: string;
  /** SPDX license identifier, e.g. "MIT" */
  license?: string;
  /** Project homepage URL */
  url?: string;
  /** Architecture: x86_64 | aarch64 | any */
  arch?: 'x86_64' | 'aarch64' | 'any';
  /** GitHub release repo to derive default download URL, e.g. "myorg/myapp" */
  releaseRepo?: string;
  /** SHA-512 checksum of the source tarball (leave empty to use SKIP for development) */
  sha512sum?: string;
  /** Runtime dependencies */
  depends?: string[];
  /** Make/build dependencies */
  makedepends?: string[];
  /** Conflicts with other packages */
  conflicts?: string[];
  /** Provides (virtual packages) */
  provides?: string[];
}

function defaultSourceUrl(config: Config): string {
  const repo = config.releaseRepo ?? config.pkgname;
  return `https://github.com/${repo}/releases/download/v$pkgver/${config.pkgname}-$pkgver-${config.arch ?? 'x86_64'}.tar.gz`;
}

function renderPKGBUILD(config: Config, version: string): string {
  const name = config.pkgname;
  const arch = config.arch ?? 'x86_64';
  const license = config.license ?? 'MIT';
  const description = config.pkgdesc ?? `${name} package`;
  const homepage = config.url ?? 'https://sh1pt.com';
  const sourceUrl = defaultSourceUrl(config);
  const sha512 = config.sha512sum ?? 'SKIP';
  const depends = config.depends ?? [];
  const makedepends = config.makedepends ?? [];
  const conflicts = config.conflicts ?? [];
  const provides = config.provides ?? [];

  const lines = [
    `# Maintainer: sh1pt <noreply@sh1pt.com>`,
    `pkgname=${name}`,
    `pkgver=${version}`,
    `pkgrel=1`,
    `pkgdesc="${description}"`,
    `arch=('${arch}')`,
    `url="${homepage}"`,
    `license=('${license}')`,
  ];

  if (depends.length) lines.push(`depends=(${depends.map((d) => `'${d}'`).join(' ')})`);
  if (makedepends.length) lines.push(`makedepends=(${makedepends.map((d) => `'${d}'`).join(' ')})`);
  if (provides.length) lines.push(`provides=(${provides.map((p) => `'${p}'`).join(' ')})`);
  if (conflicts.length) lines.push(`conflicts=(${conflicts.map((c) => `'${c}'`).join(' ')})`);

  lines.push(
    `source=("${name}-\${pkgver}.tar.gz::${sourceUrl}")`,
    `sha512sums=('${sha512}')`,
    '',
    'package() {',
    `    install -Dm755 "${name}" "\${pkgdir}/usr/bin/${name}"`,
    `    install -Dm644 LICENSE "\${pkgdir}/usr/share/licenses/${name}/LICENSE" 2>/dev/null || true`,
    '}',
    '',
  );

  return lines.join('\n');
}

function renderSRCINFO(config: Config, version: string): string {
  const name = config.pkgname;
  const arch = config.arch ?? 'x86_64';
  return [
    `pkgbase = ${name}`,
    `\tpkgdesc = ${config.pkgdesc ?? `${name} package`}`,
    `\tpkgver = ${version}`,
    `\tpkgrel = 1`,
    `\turl = ${config.url ?? 'https://sh1pt.com'}`,
    `\tarch = ${arch}`,
    `\tlicense = ${config.license ?? 'MIT'}`,
    `\tsource = ${name}-${version}.tar.gz::${defaultSourceUrl(config).replace('$pkgver', version)}`,
    `\tsha512sums = ${config.sha512sum ?? 'SKIP'}`,
    '',
    `pkgname = ${name}`,
    '',
  ].join('\n');
}

export default defineTarget<Config>({
  id: 'pkg-pacman',
  kind: 'package-manager',
  label: 'Arch Linux AUR / Pacman',

  async build(ctx, config) {
    const version = ctx.version.replace(/^v/, '');
    const pkgbuildPath = join(ctx.outDir, 'PKGBUILD');
    const srcinfoPath = join(ctx.outDir, '.SRCINFO');

    ctx.log(`generate PKGBUILD + .SRCINFO for ${config.pkgname} v${version}`);
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(pkgbuildPath, renderPKGBUILD(config, version), 'utf-8');
    await writeFile(srcinfoPath, renderSRCINFO(config, version), 'utf-8');
    ctx.log(`wrote ${pkgbuildPath}`);
    ctx.log(`wrote ${srcinfoPath}`);

    return { artifact: pkgbuildPath };
  },

  async ship(ctx, config) {
    const version = ctx.version.replace(/^v/, '');
    ctx.log(`push ${config.pkgname} v${version} to AUR`);

    if (ctx.dryRun) return { id: 'dry-run' };

    // TODO: push updated PKGBUILD + .SRCINFO to the AUR git remote
    // AUR URL: ssh://aur@aur.archlinux.org/<pkgname>.git
    // Requires AUR_SSH_KEY from ctx.secret('AUR_SSH_KEY')
    return {
      id: `${config.pkgname}@${version}`,
      url: `https://aur.archlinux.org/packages/${config.pkgname}`,
    };
  },

  async status(id) {
    const [name] = id.split('@');
    return { state: 'live', url: `https://aur.archlinux.org/packages/${name}` };
  },

  setup: manualSetup({
    label: 'Arch Linux AUR',
    vendorDocUrl: 'https://wiki.archlinux.org/title/AUR_submission_guidelines',
    steps: [
      'Register an account at aur.archlinux.org',
      'Add your SSH public key in your AUR account settings',
      'Run: sh1pt secret set AUR_SSH_KEY <path-to-private-key>',
      'First time: clone your AUR package repo: ssh://aur@aur.archlinux.org/<pkgname>.git',
      'sh1pt will push updated PKGBUILD and .SRCINFO on each release',
    ],
  }),
});
