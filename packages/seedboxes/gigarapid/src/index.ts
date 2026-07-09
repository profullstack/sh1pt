import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

// GigaRapid (GigaDrive) — lower-cost app/seedbox platform with partial API
// documentation covering disk-space HTTP endpoints and app connection details.
// Affiliate status needs confirmation.
//
// Docs: https://giga-rapid.com/docs

interface Config {
  host: string;           // SSH/SFTP hostname
  username: string;       // GigaDrive username
  port?: number;          // SSH port (default 22)
  // GigaRapid exposes some HTTP endpoints for disk/app stats
  dashboardUrl?: string;  // e.g. 'https://app.giga-rapid.com'
  qbittorrentUrl?: string;
  rtorrentUrl?: string;
  sonarrUrl?: string;
  radarrUrl?: string;
}

export default defineTarget<Config>({
  id: 'seedbox-gigarapid',
  kind: 'seedbox',
  label: 'GigaRapid',

  async build(ctx) {
    ctx.log('seedbox-gigarapid · build (no-op for seedbox targets)');
    return { artifact: ctx.projectDir };
  },

  async ship(ctx, config) {
    ctx.log(`seedbox-gigarapid · connect · host=${config.host} user=${config.username}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: implement — SFTP upload + app-level API or disk-space HTTP endpoint
    throw new Error('seedbox-gigarapid ship: not yet implemented');
  },

  setup: manualSetup({
    label: 'GigaRapid',
    vendorDocUrl: 'https://giga-rapid.com/docs',
    steps: [
      'Log in to giga-rapid.com → Dashboard → select your service',
      'Find connection details (host, username, port) under "Connection Info"',
      'Run: sh1pt secret set GIGARAPID_HOST <host>',
      'Run: sh1pt secret set GIGARAPID_USERNAME <username>',
      'Run: sh1pt secret set GIGARAPID_PASSWORD <password>',
    ],
  }),
});
