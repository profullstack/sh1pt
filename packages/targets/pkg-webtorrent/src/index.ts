import { defineTarget, exec, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

// Distribute a release artifact as a WebTorrent-compatible torrent.
//
// `build` creates a .torrent file from the artifact path.
// `ship`  seeds it via the `webtorrent` CLI and optionally announces to
//         a tracker URL so peers can find it without a magnet link.
//
// Requires: webtorrent-cli (bundled as a dep — available after install).

interface Config {
  // Path to the artifact to torrent (file or directory). Defaults to
  // ctx.projectDir if omitted.
  artifactPath?: string;
  // WebTorrent-compatible tracker announce URL(s).
  // Defaults to a set of public trackers if omitted.
  trackers?: string[];
  // Keep the seeding process running after ship() returns. Default false
  // (exits after the torrent is created and the magnet link is printed).
  keepSeeding?: boolean;
}

const DEFAULT_TRACKERS = [
  'wss://tracker.btorrent.xyz',
  'wss://tracker.openwebtorrent.com',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.tracker.cl:1337/announce',
];

export default defineTarget<Config>({
  id: 'pkg-webtorrent',
  kind: 'package-manager',
  label: 'WebTorrent',

  async build(ctx, config) {
    const source = config?.artifactPath
      ? join(ctx.projectDir, config.artifactPath)
      : ctx.projectDir;

    await mkdir(ctx.outDir, { recursive: true });
    const torrentName = `${basename(source)}-${ctx.version}.torrent`;
    const torrentPath = join(ctx.outDir, torrentName);

    ctx.log(`webtorrent create "${source}" → ${torrentPath}`);
    if (ctx.dryRun) return { artifact: torrentPath };

    const trackers = config?.trackers ?? DEFAULT_TRACKERS;
    const announceArgs = trackers.flatMap((t) => ['--announce', t]);

    await exec('webtorrent', ['create', source, '--out', torrentPath, ...announceArgs], {
      log: ctx.log,
      throwOnNonZero: true,
    });

    return { artifact: torrentPath };
  },

  async ship(ctx, config) {
    const source = config?.artifactPath
      ? join(ctx.projectDir, config.artifactPath)
      : ctx.projectDir;

    ctx.log(`webtorrent seed "${source}"`);
    if (ctx.dryRun) return { id: 'dry-run' };

    const trackers = config?.trackers ?? DEFAULT_TRACKERS;
    const announceArgs = trackers.flatMap((t) => ['--announce', t]);
    const seedArgs = [
      'seed', source,
      ...announceArgs,
      ...(config?.keepSeeding ? [] : ['--keep-seeding', 'false']),
    ];

    // Capture the magnet link from webtorrent's stdout.
    let magnetLink = '';
    await exec('webtorrent', seedArgs, {
      log: (line) => {
        ctx.log(line);
        if (line.includes('magnet:')) magnetLink = line.trim();
      },
      throwOnNonZero: true,
    });

    // Persist magnet link next to the torrent for downstream steps.
    const magnetPath = join(ctx.outDir, `${basename(source)}-${ctx.version}.magnet`);
    if (magnetLink) {
      await mkdir(ctx.outDir, { recursive: true });
      await writeFile(magnetPath, magnetLink, 'utf-8');
      ctx.log(`magnet link saved to ${magnetPath}`);
    }

    return { id: magnetLink || source, url: magnetLink || undefined };
  },

  async status(id) {
    return { state: 'live', version: id };
  },

  setup: manualSetup({
    label: 'WebTorrent',
    vendorDocUrl: 'https://webtorrent.io',
    steps: [
      'webtorrent-cli is installed automatically as a dependency of this target.',
      'No API keys required for public trackers.',
      'To use a private tracker, set the tracker announce URL in sh1pt.config.ts:',
      '  targets: [{ id: "pkg-webtorrent", trackers: ["wss://your-tracker/announce"] }]',
    ],
  }),
});
