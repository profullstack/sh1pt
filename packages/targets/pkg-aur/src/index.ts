import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  pkgName: string;           // AUR package name, e.g. "myapp-bin"
  pkgbuildTemplate?: string; // path to custom PKGBUILD template (optional)
  maintainer?: string;       // AUR maintainer name shown in PKGBUILD
  arch?: ('x86_64' | 'aarch64' | 'any')[];
}

export default defineTarget<Config>({
  id: 'pkg-aur',
  kind: 'package-manager',
  label: 'Arch User Repository (AUR)',
  async build(ctx, config) {
    const arches = config.arch ?? ['x86_64', 'aarch64'];
    ctx.log(`render PKGBUILD for ${config.pkgName} v${ctx.version} [${arches.join(', ')}]`);
    // TODO: render PKGBUILD + .SRCINFO from template:
    //   pkgname=${pkgName}  pkgver=${version}  arch=(${arches.join(' ')})
    //   source=("https://github.com/…/releases/download/v${version}/…")
    //   sha256sums=(…)
    // TODO: run `makepkg --printsrcinfo > .SRCINFO`
    return { artifact: `${ctx.outDir}/PKGBUILD` };
  },
  async ship(ctx, config) {
    ctx.log(`push PKGBUILD + .SRCINFO to AUR ssh://aur@aur.archlinux.org/${config.pkgName}.git`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: git clone ssh://aur@aur.archlinux.org/${pkgName}.git (using AUR_SSH_KEY secret)
    //       copy PKGBUILD + .SRCINFO, commit "upgpkg: ${pkgName} ${version}", push
    return {
      id: `${config.pkgName}@${ctx.version}`,
      url: `https://aur.archlinux.org/packages/${config.pkgName}`,
    };
  },
  async status(id) {
    const [name] = id.split('@');
    return { state: 'live', url: `https://aur.archlinux.org/packages/${name}` };
  },

  setup: manualSetup({
    label: 'Arch User Repository (AUR)',
    vendorDocUrl: 'https://wiki.archlinux.org/title/AUR_submission_guidelines',
    steps: [
      'Create an account at https://aur.archlinux.org and register an SSH key in your profile',
      'Run: sh1pt secret set AUR_SSH_KEY "$(cat ~/.ssh/id_ed25519)"  (or your AUR key)',
      'First-time publish: manually create the AUR package via `ssh aur@aur.archlinux.org` setup-repo',
      'sh1pt handles subsequent version bumps automatically (PKGBUILD render + git push)',
      'Naming convention: use <name>-bin for pre-built binaries, <name>-git for VCS packages',
    ],
  }),
});
