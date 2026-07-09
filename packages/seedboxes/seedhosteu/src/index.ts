import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

// Seedhost.eu — popular EU seedbox and app hosting. Client-area + app-level
// access via SSH/SFTP. No public provider API or affiliate program found.
//
// Docs: https://www.seedhost.eu/wiki

interface Config {
  host: string;           // SSH/SFTP hostname (e.g. 'sXX.seedhost.eu')
  username: string;       // Seedhost username
  port?: number;          // SSH port (default 22)
  rtorrentUrl?: string;
  qbittorrentUrl?: string;
  sonarrUrl?: string;
  radarrUrl?: string;
}

export default defineTarget<Config>({
  id: 'seedbox-seedhosteu',
  kind: 'seedbox',
  label: 'Seedhost.eu',

  async build(ctx) {
    ctx.log('seedbox-seedhosteu · build (no-op for seedbox targets)');
    return { artifact: ctx.projectDir };
  },

  async ship(ctx, config) {
    ctx.log(`seedbox-seedhosteu · connect · host=${config.host} user=${config.username}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: implement — SFTP/rclone upload, app-level API calls
    throw new Error('seedbox-seedhosteu ship: not yet implemented');
  },

  setup: manualSetup({
    label: 'Seedhost.eu',
    vendorDocUrl: 'https://www.seedhost.eu/wiki',
    steps: [
      'Log in to seedhost.eu → Client Area → select your service',
      'Find SSH/SFTP credentials in the service welcome email or control panel',
      'Run: sh1pt secret set SEEDHOSTEU_HOST <sXX.seedhost.eu>',
      'Run: sh1pt secret set SEEDHOSTEU_USERNAME <username>',
      'Run: sh1pt secret set SEEDHOSTEU_SSH_KEY_PATH ~/.ssh/id_rsa  (or set SEEDHOSTEU_PASSWORD)',
    ],
  }),
});
