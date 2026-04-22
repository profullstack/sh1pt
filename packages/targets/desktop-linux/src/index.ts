import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

type Format = 'appimage' | 'snap' | 'flatpak' | 'deb' | 'rpm' | 'tar.gz';

interface Config {
  appId: string;                     // e.g. com.acme.myapp
  formats: Format[];                 // which packages to produce
  architectures?: ('x64' | 'arm64')[];
  // per-format publish targets — each optional
  snap?: { channel?: 'stable' | 'candidate' | 'beta' | 'edge' };
  flatpak?: { remote: string };      // e.g. "flathub"
  apt?: { repo: string };            // e.g. "acme/stable"
  rpm?: { repo: string };
  direct?: { host: 'github-releases' | 'cdn'; project?: string };
}

export default defineTarget<Config>({
  id: 'desktop-linux',
  kind: 'desktop',
  label: 'Linux (AppImage / Snap / Flatpak / deb / rpm)',
  async build(ctx, config) {
    const arches = config.architectures ?? ['x64', 'arm64'];
    ctx.log(`build ${config.formats.join(',')} · arches=${arches.join(',')}`);
    // TODO, per format:
    //  - appimage: appimagetool → .AppImage
    //  - snap:     snapcraft build → .snap
    //  - flatpak:  flatpak-builder → .flatpak
    //  - deb:      dpkg-deb or fpm → .deb
    //  - rpm:      rpmbuild or fpm → .rpm
    //  - tar.gz:   tar czf bin + desktop entry + icon
    return { artifact: `${ctx.outDir}/linux/` };
  },
  async ship(ctx, config) {
    const channels = config.formats
      .map((f) => {
        if (f === 'snap') return `Snapcraft:${config.snap?.channel ?? 'stable'}`;
        if (f === 'flatpak') return `Flatpak:${config.flatpak?.remote ?? 'flathub'}`;
        if (f === 'deb') return `apt:${config.apt?.repo ?? 'self-hosted'}`;
        if (f === 'rpm') return `rpm:${config.rpm?.repo ?? 'self-hosted'}`;
        return `${f}:${config.direct?.host ?? 'cdn'}`;
      })
      .join(', ');
    ctx.log(`publish ${config.appId}@${ctx.version} → ${channels}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO, per format:
    //  - snap:     snapcraft push + release via Snap Store API
    //  - flatpak:  open PR against flathub repo (like pkg-homebrew pattern)
    //  - appimage: upload to GitHub release or CDN + refresh update.json
    //  - deb/rpm:  aptly / createrepo + sign + push to configured repo
    return { id: `${config.appId}@${ctx.version}` };
  },
  async status(id) {
    return { state: 'live', version: id };
  },

  setup: manualSetup({
    label: "Desktop (Linux \u2014 Snap / Flatpak / AppImage)",
    vendorDocUrl: "https://snapcraft.io/",
    steps: [
      "Snap: register at snapcraft.io \u2192 snapcraft login \u2192 snapcraft export-login",
      "Flathub: submit manifest to flathub/flathub repo (manual review 1-4 weeks)",
      "AppImage: no registry, just publish to your own CDN",
    ],
  }),
});
