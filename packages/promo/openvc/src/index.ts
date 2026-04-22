import { defineAdPlatform, oauthSetup } from '@profullstack/sh1pt-core';

// OpenVC (openvc.app) — free-tier VC directory with contact info.
// Discovery-focused; use results as a feed into a CRM or cold-email
// sender. No sending happens here — that's the user's downstream tool.
interface Config {
  stage?: 'pre-seed' | 'seed' | 'series-a' | 'series-b';
  sectors?: string[];
  geographies?: string[];
  checkSizeMin?: number;
  checkSizeMax?: number;
  exportPath?: string;               // where to write the CSV export
}

export default defineAdPlatform<Config>({
  id: 'promo-openvc',
  label: 'OpenVC (free VC directory — discovery only)',
  async connect(ctx) {
    // OpenVC's free tier works without auth; paid tier offers an API key.
    ctx.log('openvc connected · using free tier unless OPENVC_API_KEY is in vault');
    return { accountId: 'openvc' };
  },
  async start(ctx, config) {
    ctx.log(`openvc search · stage=${config.stage ?? 'seed'} · sectors=${config.sectors?.join(',') ?? 'any'}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: scrape-friendly discovery (they provide CSV exports on free tier)
    return { id: `openvc_${Date.now()}`, url: 'https://www.openvc.app/' };
  },
  async status() { return { state: 'active', spend: 0, impressions: 0, clicks: 0 }; },
  async stop(id) { console.log(`[stub] openvc ${id}`); },

  setup: oauthSetup({
    secretKey: "OPENVC_API_KEY",
    label: "OpenVC",
    vendorDocUrl: "https://www.openvc.app/",
    steps: [
      "Open openvc.app \u2192 sign up",
      "OpenVC has no public write API yet \u2014 sh1pt drives browser mode",
      "Paste your OpenVC email/password (stored in vault) or session cookie",
    ],
  }),
});
