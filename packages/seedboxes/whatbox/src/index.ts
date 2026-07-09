import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

// Whatbox — highly respected among power users. Strong app-level API support:
// rTorrent XML-RPC, SSH scripting, and user automation docs.
// No public affiliate program found.
//
// Docs: https://whatbox.ca/wiki

interface Config {
  host: string;           // SSH hostname (e.g. 'hostname.whatbox.ca')
  username: string;       // Whatbox username
  port?: number;          // SSH port (default 22)
  // rTorrent XML-RPC is the primary torrent API on Whatbox
  rtorrentUrl?: string;   // e.g. 'https://hostname.whatbox.ca/RPC2'
  qbittorrentUrl?: string;
  sonarrUrl?: string;
  radarrUrl?: string;
}

export default defineTarget<Config>({
  id: 'seedbox-whatbox',
  kind: 'seedbox',
  label: 'Whatbox',

  async build(ctx) {
    ctx.log('seedbox-whatbox · build (no-op for seedbox targets)');
    return { artifact: ctx.projectDir };
  },

  async ship(ctx, config) {
    ctx.log(`seedbox-whatbox · connect · host=${config.host} user=${config.username}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: implement — SFTP/rclone, rTorrent XML-RPC for torrent ops
    throw new Error('seedbox-whatbox ship: not yet implemented');
  },

  setup: manualSetup({
    label: 'Whatbox',
    vendorDocUrl: 'https://whatbox.ca/wiki',
    steps: [
      'Log in to whatbox.ca → select your slot',
      'Find your hostname and SSH credentials from the slot details page',
      'Run: sh1pt secret set WHATBOX_HOST <hostname>.whatbox.ca',
      'Run: sh1pt secret set WHATBOX_USERNAME <username>',
      'Run: sh1pt secret set WHATBOX_SSH_KEY_PATH ~/.ssh/id_rsa  (or set WHATBOX_PASSWORD)',
      'For rTorrent: note the XML-RPC URL from whatbox.ca/wiki/rutorrent',
      'Run: sh1pt secret set WHATBOX_RTORRENT_URL <url>',
    ],
  }),
});
