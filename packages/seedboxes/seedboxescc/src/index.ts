import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

// Seedboxes.cc — established since 2010, polished product with Seedbucket
// dashboard. App-level API keys available for SABnzbd/NZBGet and other apps.
// Affiliate status unclear — needs direct confirmation.
//
// Docs: https://seedboxes.cc/getting-started

interface Config {
  host: string;           // SSH/SFTP hostname
  username: string;       // Seedboxes.cc username
  port?: number;          // SSH port (default 22)
  qbittorrentUrl?: string;
  rtorrentUrl?: string;
  sonarrUrl?: string;
  radarrUrl?: string;
  sabnzbdUrl?: string;    // SABnzbd API (Seedbucket supports this)
  nzbgetUrl?: string;
}

export default defineTarget<Config>({
  id: 'seedbox-seedboxescc',
  kind: 'seedbox',
  label: 'Seedboxes.cc',

  async build(ctx) {
    ctx.log('seedbox-seedboxescc · build (no-op for seedbox targets)');
    return { artifact: ctx.projectDir };
  },

  async ship(ctx, config) {
    ctx.log(`seedbox-seedboxescc · connect · host=${config.host} user=${config.username}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: implement — SFTP upload, app-level API (qBittorrent, SABnzbd, etc.)
    throw new Error('seedbox-seedboxescc ship: not yet implemented');
  },

  setup: manualSetup({
    label: 'Seedboxes.cc',
    vendorDocUrl: 'https://seedboxes.cc/getting-started',
    steps: [
      'Log in to seedboxes.cc → My Seedboxes → select your service',
      'Find SSH/SFTP credentials in the service control panel',
      'Run: sh1pt secret set SEEDBOXESCC_HOST <host>',
      'Run: sh1pt secret set SEEDBOXESCC_USERNAME <username>',
      'Run: sh1pt secret set SEEDBOXESCC_SSH_KEY_PATH ~/.ssh/id_rsa  (or set SEEDBOXESCC_PASSWORD)',
    ],
  }),
});
