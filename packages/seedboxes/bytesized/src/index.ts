import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

// Bytesized Hosting — long-running AppBox/media-server provider with 67+ one-click
// apps and 10% lifetime recurring affiliate commissions. Strong fit for
// Plex/Jellyfin and full media-server stacks.
//
// Affiliate: https://bytesized-hosting.com/affiliate (10% lifetime recurring)

interface Config {
  host: string;           // SSH/SFTP hostname (e.g. 'nl.bytesized-hosting.com')
  username: string;       // AppBox username
  port?: number;          // SSH port (default 22)
  qbittorrentUrl?: string;
  rtorrentUrl?: string;
  sonarrUrl?: string;
  radarrUrl?: string;
  plexUrl?: string;
  jellyfinUrl?: string;
}

export default defineTarget<Config>({
  id: 'seedbox-bytesized',
  kind: 'seedbox',
  label: 'Bytesized Hosting',

  async build(ctx) {
    ctx.log('seedbox-bytesized · build (no-op for seedbox targets)');
    return { artifact: ctx.projectDir };
  },

  async ship(ctx, config) {
    ctx.log(`seedbox-bytesized · connect · host=${config.host} user=${config.username}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: implement — upload via SFTP/rclone, trigger torrent/media app via API
    throw new Error('seedbox-bytesized ship: not yet implemented');
  },

  setup: manualSetup({
    label: 'Bytesized Hosting',
    vendorDocUrl: 'https://bytesized-hosting.com/pages/help',
    steps: [
      'Log in to bytesized-hosting.com → My Services → select your AppBox',
      'Find SSH credentials under the "Connection" tab',
      'Run: sh1pt secret set BYTESIZED_HOST <host>',
      'Run: sh1pt secret set BYTESIZED_USERNAME <username>',
      'Run: sh1pt secret set BYTESIZED_SSH_KEY_PATH ~/.ssh/id_rsa  (or set BYTESIZED_PASSWORD)',
      'Note per-app API URLs and tokens from each installed app\'s settings',
    ],
  }),
});
