import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

// RapidSeedbox — mainstream seedbox with Network API key support and a public
// affiliate program. Provider-level API allows basic seedbox management;
// app-level APIs (qBittorrent, Sonarr/Radarr, Plex, etc.) are the main
// integration surface for file/torrent operations.
//
// Affiliate: https://www.rapidseedbox.com/affiliate-program (paid indefinitely)
// Network API: available from dashboard → Network API

interface Config {
  host: string;           // SSH/SFTP hostname (e.g. 'nl1.rapidseedbox.com')
  username: string;       // seedbox username
  port?: number;          // SSH port (default 22)
  // App-level API configs (qBittorrent, rTorrent, Sonarr, etc.)
  qbittorrentUrl?: string;
  rtorrentUrl?: string;
  sonarrUrl?: string;
  radarrUrl?: string;
}

export default defineTarget<Config>({
  id: 'seedbox-rapidseedbox',
  kind: 'seedbox',
  label: 'RapidSeedbox',

  async build(ctx) {
    ctx.log('seedbox-rapidseedbox · build (no-op for seedbox targets)');
    return { artifact: ctx.projectDir };
  },

  async ship(ctx, config) {
    ctx.log(`seedbox-rapidseedbox · connect · host=${config.host} user=${config.username}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: implement — upload via SFTP/rclone, trigger torrent via app API
    throw new Error('seedbox-rapidseedbox ship: not yet implemented');
  },

  setup: manualSetup({
    label: 'RapidSeedbox',
    vendorDocUrl: 'https://www.rapidseedbox.com/kb/get-started',
    steps: [
      'Log in to rapidseedbox.com → My Seedboxes → select your seedbox',
      'Note your SSH host, username, and port from the dashboard',
      'Run: sh1pt secret set RAPIDSEEDBOX_HOST <host>',
      'Run: sh1pt secret set RAPIDSEEDBOX_USERNAME <username>',
      'Run: sh1pt secret set RAPIDSEEDBOX_SSH_KEY_PATH ~/.ssh/id_rsa  (or set RAPIDSEEDBOX_PASSWORD)',
      'Optional — Network API: dashboard → Network API → Generate Key',
      'Run: sh1pt secret set RAPIDSEEDBOX_API_KEY <key>',
    ],
  }),
});
