import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

// Ultra.cc — very popular and polished seedbox provider. No active affiliate
// program (ended per their announcement). Has an unofficial storage/traffic
// API endpoint documented in community scripts.
//
// Docs: https://docs.ultra.cc

interface Config {
  host: string;           // SSH/SFTP hostname (e.g. 'username.ultra.cc')
  username: string;       // Ultra.cc username
  port?: number;          // SSH port (default 22)
  qbittorrentUrl?: string;
  rtorrentUrl?: string;
  sonarrUrl?: string;
  radarrUrl?: string;
  plexUrl?: string;
  jellyfinUrl?: string;
}

export default defineTarget<Config>({
  id: 'seedbox-ultracc',
  kind: 'seedbox',
  label: 'Ultra.cc',

  async build(ctx) {
    ctx.log('seedbox-ultracc · build (no-op for seedbox targets)');
    return { artifact: ctx.projectDir };
  },

  async ship(ctx, config) {
    ctx.log(`seedbox-ultracc · connect · host=${config.host} user=${config.username}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: implement — SFTP/rclone upload, app-level API calls
    throw new Error('seedbox-ultracc ship: not yet implemented');
  },

  setup: manualSetup({
    label: 'Ultra.cc',
    vendorDocUrl: 'https://docs.ultra.cc',
    steps: [
      'Log in to my.ultra.cc → select your service',
      'Find SSH/SFTP credentials under "Service Details"',
      'Run: sh1pt secret set ULTRACC_HOST <username>.ultra.cc',
      'Run: sh1pt secret set ULTRACC_USERNAME <username>',
      'Run: sh1pt secret set ULTRACC_SSH_KEY_PATH ~/.ssh/id_rsa  (or set ULTRACC_PASSWORD)',
    ],
  }),
});
