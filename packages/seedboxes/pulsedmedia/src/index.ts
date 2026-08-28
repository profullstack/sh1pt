import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

// Pulsed Media — Finnish seedbox, storage box and dedicated server host (since
// 2010). Boxes run PMSS, their own open-source stack (GPL-3.0,
// github.com/MagnaCapax/PMSS), which serves each user a panel at
// `https://<host>/user-<username>/` alongside SSH/SFTP/rsync/rclone/WebDAV as a
// user — never root. There is no provider provisioning API; ordering and
// cancellation both happen in the WHMCS client area.
//
// The VPS / storage-box side of the same account is cloud-pulsedmedia, which
// carries the published price table and the adopt-an-existing-service flow.
//
// Store:     https://pulsedmedia.com/clients/index.php/store/the-eternal-vainamoinen
// Wiki:      https://wiki.pulsedmedia.com/
// Affiliate: https://pulsedmedia.com/affiliates.php (automatic weekly credit)

interface Config {
  host: string;           // SSH/SFTP hostname
  username: string;       // seedbox username
  port?: number;          // SSH port (default 22)
  rtorrentUrl?: string;   // rTorrent XML-RPC endpoint, behind ruTorrent
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
      'Log in to pulsedmedia.com/clients → My Services → select your seedbox',
      'Find SSH/SFTP credentials in your service welcome email or client area',
      'The panel for the same box is https://<host>/user-<username>/ (same password)',
      'Run: sh1pt secret set PULSEDMEDIA_HOST <host>',
      'Run: sh1pt secret set PULSEDMEDIA_USERNAME <username>',
      'Run: sh1pt secret set PULSEDMEDIA_SSH_KEY_PATH ~/.ssh/id_rsa  (or set PULSEDMEDIA_PASSWORD)',
      'For the VPS / storage-box side of the same account: sh1pt setup cloud-pulsedmedia',
    ],
  }),
});
