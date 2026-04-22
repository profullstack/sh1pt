import { defineAdPlatform, oauthSetup } from '@profullstack/sh1pt-core';

// Apple Search Ads — promotes iOS apps in the App Store search results.
// The highest-intent mobile ad channel (user is literally searching for
// apps). Two tiers: Basic (simple automated) and Advanced (full control).
interface Config {
  orgId: number;                         // from searchads.apple.com
  adamId: number;                        // iTunes app id
  tier: 'basic' | 'advanced';
  keywords?: string[];                   // advanced tier
  storefronts?: string[];                // ISO country codes
}

export default defineAdPlatform<Config>({
  id: 'promo-apple-search',
  label: 'Apple Search Ads',
  async connect(ctx, config) {
    ctx.log(`connect apple search ads · org=${config.orgId}`);
    // TODO: Apple Search Ads API uses private-key JWT auth (not OAuth)
    // Store APPLE_SEARCH_ADS_PRIVATE_KEY + key id + team id in secrets
    return { accountId: String(config.orgId) };
  },
  async start(ctx, config) {
    const ios = ctx.storeUrls.ios;
    if (!ios) ctx.log('no iOS store URL in context — Apple Search Ads requires a published App Store listing', 'error');
    ctx.log(`apple search ads · tier=${config.tier} · storefronts=${config.storefronts?.join(',') ?? 'US'}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: POST /v4/campaigns + /adgroups + /targetingkeywords (advanced tier only)
    return { id: `asa_${Date.now()}`, url: `https://app.searchads.apple.com/cm/app/${config.orgId}` };
  },
  async status() {
    return { state: 'active', spend: 0, impressions: 0, clicks: 0, installs: 0 };
  },
  async stop(id) {
    console.log(`[stub] apple search ads stop ${id}`);
  },

  setup: oauthSetup({
    secretKey: "APPLE_SEARCH_ADS_JWT",
    label: "Apple Search Ads",
    vendorDocUrl: "https://app.searchads.apple.com/",
    steps: [
      "Open app.searchads.apple.com \u2192 Settings \u2192 API",
      "Generate a public/private key pair; download the private key (.p8 file)",
      "Mint a JWT client_secret (sh1pt can generate this from your .p8 path if provided)",
    ],
  }),
});
