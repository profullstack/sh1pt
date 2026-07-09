import { defineAdPlatform, oauthSetup } from '@profullstack/sh1pt-core';

// Google Ads. Covers Search, Display Network, Discover, Gmail, and
// (via separate promo-youtube adapter) YouTube. For mobile, use App
// Campaigns (UAC) — Google picks placements across Play, Search, YouTube,
// Display automatically given assets.
type CampaignType = 'search' | 'display' | 'discover' | 'performance-max' | 'app-install';

interface Config {
  customerId: string;                    // Google Ads customer id (no dashes)
  managerId?: string;                    // MCC id if ads are managed under a Manager account
  campaignType: CampaignType;
  // App Campaign inputs (when campaignType='app-install')
  appId?: string;                        // Play package name or App Store id
  appStore?: 'google-play' | 'app-store';
  // Search/Display inputs
  keywords?: string[];
  landingPage?: string;
}

export default defineAdPlatform<Config>({
  id: 'promo-google',
  label: 'Google Ads (Search / Display / App / PMax)',
  async connect(ctx, config) {
    ctx.log(`connect google ads · customer=${config.customerId}`);
    // TODO: Google OAuth for Ads API; store refresh token in secrets
    return { accountId: config.customerId };
  },
  async start(ctx, config) {
    ctx.log(`google ads · type=${config.campaignType} · objective=${ctx.objective}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: Google Ads API v17+ — CampaignService.mutate → AdGroupService → AdService
    return { id: `ga_${Date.now()}`, url: `https://ads.google.com/aw/campaigns?ocid=${config.customerId}` };
  },
  async status() {
    return { state: 'active', spend: 0, impressions: 0, clicks: 0 };
  },
  async stop(id) {
    console.log(`[stub] google ads stop ${id}`);
  },

  setup: oauthSetup({
    secretKey: "GOOGLE_ADS_REFRESH_TOKEN",
    label: "Google Ads",
    vendorDocUrl: "https://ads.google.com/aw/apicenter",
    steps: [
      "Open ads.google.com \u2192 Tools \u2192 API Center \u2192 apply for developer token",
      "Create OAuth credentials at console.cloud.google.com \u2192 complete OAuth for adwords scope",
    ],
  }),
});
