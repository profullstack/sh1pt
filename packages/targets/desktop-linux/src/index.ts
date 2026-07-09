import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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

const APP_ID_PATTERN = /^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*)+$/;

function requireAppId(config: Config): string {
  const appId = config.appId?.trim();
  if (!appId) throw new Error('desktop-linux requires appId');
  if (!APP_ID_PATTERN.test(appId)) {
    throw new Error('desktop-linux appId must be a valid reverse-DNS identifier');
  }
  return appId;
}

export default defineTarget<Config>({
  id: 'desktop-linux',
  kind: 'desktop',
  label: 'Linux (AppImage / Snap / Flatpak / deb / rpm)',
  async build(ctx, config) {
    const appId = requireAppId(config);
    const arches = config.architectures ?? ['x64', 'arm64'];
    ctx.log(`build ${config.formats.join(',')} · arches=${arches.join(',')}`);
    const artifactDir = join(ctx.outDir, 'linux');
    const planPath = join(artifactDir, 'linux-package-plan.json');
    await mkdir(artifactDir, { recursive: true });
    await writeFile(planPath, `${JSON.stringify({
      appId,
      version: ctx.version,
      channel: ctx.channel,
      formats: config.formats,
      architectures: arches,
      snap: config.snap,
      flatpak: config.flatpak,
      apt: config.apt,
      rpm: config.rpm,
      direct: config.direct,
    }, null, 2)}\n`, 'utf-8');
    return { artifact: planPath };
  },
  async ship(ctx, config) {
    const appId = requireAppId(config);
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
    return { id: `${appId}@${ctx.version}` };
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
