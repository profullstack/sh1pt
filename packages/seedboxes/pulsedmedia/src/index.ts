import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

// Pulsed Media — older/infrastructure-style seedbox and dedicated server provider.
// Affiliate program active again with automatic weekly credit payouts.
// Access via SSH/SFTP and app-level APIs; no public provider provisioning API.
//
// Affiliate: https://pulsedmedia.com/affiliates.php (automatic weekly credit)

interface Config {
  host: string;           // SSH/SFTP hostname
  username: string;       // seedbox username
  port?: number;          // SSH port (default 22)
  rtorrentUrl?: string;   // rTorrent XML-RPC endpoint (common on Pulsed Media)
  qbittorrentUrl?: string;
  sonarrUrl?: string;
  radarrUrl?: string;
}

export default defineTarget<Config>({
  id: 'seedbox-pulsedmedia',
  kind: 'seedbox',
  label: 'Pulsed Media',

  async build(ctx) {
    ctx.log('seedbox-pulsedmedia · build (no-op for seedbox targets)');
    return { artifact: ctx.projectDir };
  },

  async ship(ctx, config) {
    ctx.log(`seedbox-pulsedmedia · connect · host=${config.host} user=${config.username}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: implement — upload via SFTP/rclone, trigger rTorrent XML-RPC
    throw new Error('seedbox-pulsedmedia ship: not yet implemented');
  },

  setup: manualSetup({
    label: 'Pulsed Media',
    vendorDocUrl: 'https://pulsedmedia.com/clients/index.php/knowledgebase',
    steps: [
      'Log in to pulsedmedia.com → My Services → select your seedbox',
      'Find SSH/SFTP credentials in your service welcome email or client area',
      'Run: sh1pt secret set PULSEDMEDIA_HOST <host>',
      'Run: sh1pt secret set PULSEDMEDIA_USERNAME <username>',
      'Run: sh1pt secret set PULSEDMEDIA_SSH_KEY_PATH ~/.ssh/id_rsa  (or set PULSEDMEDIA_PASSWORD)',
    ],
  }),
});
