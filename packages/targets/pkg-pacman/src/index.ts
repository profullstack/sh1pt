import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

type PacmanArch = 'x86_64' | 'aarch64' | 'any';

interface Config {
  pkgname: string;            // e.g. "myapp"
  pkgdesc?: string;
  url?: string;               // homepage
  license?: string[];         // e.g. ["MIT"]
  pkgrel?: string;            // default "1"
  arch?: PacmanArch[];        // default ["x86_64"]
  depends?: string[];
  makedepends?: string[];
  sourceUrl?: string;         // upstream source tarball
  sha256sum?: string;         // checksum of the source ("SKIP" if none)
  repoName?: string;          // custom pacman repo db name (NOT the AUR)
  repoBaseUrl?: string;       // where the repo db is hosted (Server= in pacman.conf)
}

// pacman pkgver may not contain '-' or ':'. Strip leading v, map '-'/':' to '_'.
function pkgver(version: string): string {
  return version.replace(/^v/, '').replace(/[-:]/g, '_');
}

function arches(config: Config): PacmanArch[] {
  return config.arch ?? ['x86_64'];
}

// Escape a value for a double-quoted bash string in the PKGBUILD.
function shEscape(value: string): string {
  return value.replace(/(["`$\\])/g, '\\$1');
}

function bashArray(values: string[]): string {
  return values.map((v) => `'${v.replace(/'/g, "'\\''")}'`).join(' ');
}

// Reject inputs that could produce an invalid PKGBUILD or inject into the
// pacman.conf [section] header / shell commands. pkgname follows Arch rules;
// the repo db/section name allows only [A-Za-z0-9_-].
function assertValidNames(config: Config): void {
  if (!/^[a-z0-9][a-z0-9@._+-]*$/.test(config.pkgname)) {
    throw new Error(
      `pkg-pacman: invalid pkgname '${config.pkgname}' — Arch pkgnames are lowercase ` +
      'alphanumerics plus @ . _ + -, and may not start with "-" or "."',
    );
  }
  const repo = config.repoName ?? config.pkgname;
  if (!/^[A-Za-z0-9_-]+$/.test(repo)) {
    throw new Error(
      `pkg-pacman: invalid repoName '${repo}' — only letters, digits, "-" and "_" ` +
      'are allowed (it becomes a pacman.conf [section] header and a repo db filename)',
    );
  }
}

function renderPkgbuild(ctx: { version: string }, config: Config): string {
  const ver = pkgver(ctx.version);
  const rel = config.pkgrel ?? '1';
  const desc = config.pkgdesc ?? `Release package for ${config.pkgname}`;
  const license = config.license ?? ['MIT'];
  const lines = [
    '# Maintainer: sh1pt <release@sh1pt.com>',
    `pkgname=${config.pkgname}`,
    `pkgver=${ver}`,
    `pkgrel=${rel}`,
    `pkgdesc="${shEscape(desc)}"`,
    `arch=(${bashArray(arches(config))})`,
  ];
  if (config.url) lines.push(`url="${shEscape(config.url)}"`);
  lines.push(`license=(${bashArray(license)})`);
  if (config.depends?.length) lines.push(`depends=(${bashArray(config.depends)})`);
  if (config.makedepends?.length) lines.push(`makedepends=(${bashArray(config.makedepends)})`);
  if (config.sourceUrl) {
    lines.push(`source=("$pkgname-$pkgver.tar.gz::${shEscape(config.sourceUrl)}")`);
    lines.push(`sha256sums=(${bashArray([config.sha256sum ?? 'SKIP'])})`);
  } else {
    lines.push('source=()');
    lines.push('sha256sums=()');
  }
  lines.push('');
  lines.push('build() {');
  lines.push('  # TODO: project build steps (make, cargo build --release, go build, …)');
  lines.push('  :');
  lines.push('}');
  lines.push('');
  lines.push('package() {');
  lines.push('  # TODO: install built artifacts into "$pkgdir"');
  lines.push('  :');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

function renderRepoConf(config: Config): string {
  const repo = config.repoName ?? config.pkgname;
  const server = config.repoBaseUrl ?? `https://pacman.sh1pt.com/${repo}/$arch`;
  return [
    `# Add to /etc/pacman.conf to consume the custom ${repo} repository:`,
    `[${repo}]`,
    `Server = ${server}`,
    '',
  ].join('\n');
}

function publishCommands(ctx: { version: string }, config: Config): string[] {
  const repo = config.repoName ?? config.pkgname;
  const ver = pkgver(ctx.version);
  const rel = config.pkgrel ?? '1';
  const arch = arches(config)[0] ?? 'x86_64';
  const pkgfile = `${config.pkgname}-${ver}-${rel}-${arch}.pkg.tar.zst`;
  const dest = config.repoBaseUrl ?? `pacman.sh1pt.com:/var/www/pacman/${repo}`;
  return [
    'makepkg -s --sign',
    `repo-add --sign '${repo}.db.tar.zst' '${pkgfile}'`,
    `rsync ./ '${dest}/'`,
  ];
}

export default defineTarget<Config>({
  id: 'pkg-pacman',
  kind: 'package-manager',
  label: 'Pacman / Arch custom repository',
  async build(ctx, config) {
    assertValidNames(config);
    const pkgbuildPath = join(ctx.outDir, 'pacman', 'PKGBUILD');
    const confPath = join(ctx.outDir, 'pacman', `${config.repoName ?? config.pkgname}.pacman.conf`);
    ctx.log(`generate PKGBUILD for ${config.pkgname} v${ctx.version} [${arches(config).join(', ')}]`);
    await mkdir(dirname(pkgbuildPath), { recursive: true });
    await Promise.all([
      writeFile(pkgbuildPath, renderPkgbuild(ctx, config), 'utf-8'),
      writeFile(confPath, renderRepoConf(config), 'utf-8'),
    ]);
    return {
      artifact: pkgbuildPath,
      meta: { pkgbuild: pkgbuildPath, repoConf: confPath, commands: publishCommands(ctx, config) },
    };
  },
  async ship(ctx, config) {
    assertValidNames(config);
    const repo = config.repoName ?? config.pkgname;
    ctx.log(`publish ${config.pkgname}@${ctx.version} to pacman repo (${repo})`);
    if (ctx.dryRun) return { id: 'dry-run', meta: { commands: publishCommands(ctx, config) } };
    // Live publish (makepkg + repo-add + signed upload) is not implemented yet —
    // fail loudly rather than report a false success. (PACMAN_GPG_KEY is
    // documented in setup(); not checked here since the path is unimplemented.)
    throw new Error(
      `pkg-pacman live publish for ${config.pkgname} is not implemented yet — ` +
      'use dryRun to preview the makepkg + repo-add commands.',
    );
  },
  async status(id) {
    const name = id.split('@')[0] ?? id;
    return { state: 'in-review', url: `https://pacman.sh1pt.com/${name}/` };
  },
  setup: manualSetup({
    label: 'Pacman / Arch custom repository',
    vendorDocUrl: 'https://man.archlinux.org/man/repo-add.8.en',
    steps: [
      'This is a custom pacman binary repo (repo-add), NOT the AUR — for the AUR use pkg-aur.',
      'Generate a signing key: gpg --full-generate-key',
      'Run: sh1pt secret set PACMAN_GPG_KEY "$(gpg --export-secret-keys --armor <key-id>)"',
      'Run: sh1pt secret set PACMAN_GPG_PASSPHRASE <passphrase>',
      'Build needs an Arch-like host with base-devel (makepkg) + the repo-add tool.',
      'Consumers add the [repo] + Server line (generated .pacman.conf) to /etc/pacman.conf.',
    ],
  }),
});
