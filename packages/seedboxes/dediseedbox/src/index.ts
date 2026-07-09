import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

// DediSeedbox — popular budget seedbox with 10% recurring affiliate commissions.
// No public provider API; integration is via SSH/SFTP and app-level APIs
// (qBittorrent, rTorrent, Sonarr, Radarr, etc.).
//
// Affiliate: https://dediseedbox.com/affiliate-partnership.php (10% recurring)

interface Config {
  host: string;           // SSH/SFTP hostname
  username: string;       // seedbox username
  port?: number;          // SSH port (default 22)
  qbittorrentUrl?: string;
  rtorrentUrl?: string;
  sonarrUrl?: string;
  radarrUrl?: string;
}

export default defineTarget<Config>({
  id: 'seedbox-dediseedbox',
  kind: 'seedbox',
  label: 'DediSeedbox',

  async build(ctx) {
    ctx.log('seedbox-dediseedbox · build (no-op for seedbox targets)');
    return { artifact: ctx.projectDir };
  },

  async ship(ctx, config) {
    ctx.log(`seedbox-dediseedbox · connect · host=${config.host} user=${config.username}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: implement — upload via SFTP/rclone, trigger torrent via app API
    throw new Error('seedbox-dediseedbox ship: not yet implemented');
  },

  setup: manualSetup({
    label: 'DediSeedbox',
    vendorDocUrl: 'https://dediseedbox.com/knowledgebase',
    steps: [
      'Log in to dediseedbox.com → My Services → select your seedbox',
      'Find your SSH host, username, and password/key in the service details',
      'Run: sh1pt secret set DEDISEEDBOX_HOST <host>',
      'Run: sh1pt secret set DEDISEEDBOX_USERNAME <username>',
      'Run: sh1pt secret set DEDISEEDBOX_PASSWORD <password>',
    ],
  }),
});
