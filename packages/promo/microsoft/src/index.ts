import { defineAdPlatform, oauthSetup } from '@profullstack/sh1pt-core';

// Microsoft Advertising — Bing search + Microsoft Audience Network
// (MSN, Outlook, Edge). Often cheaper CPC than Google Search with
// decent volume on desktop/enterprise audiences.
interface Config {
  customerId: string;
  accountId: string;
  campaignType: 'search' | 'audience' | 'shopping';
  keywords?: string[];
  landingPage?: string;
}

export default defineAdPlatform<Config>({
  id: 'promo-microsoft',
  label: 'Microsoft Advertising (Bing)',
  async connect(ctx, config) {
    ctx.log(`connect microsoft ads · customer=${config.customerId}`);
    // TODO: Microsoft Advertising OAuth; store refresh token + developer token
    return { accountId: config.accountId };
  },
  async start(ctx, config) {
    ctx.log(`microsoft ads · type=${config.campaignType}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: Microsoft Advertising SOAP/REST API — Campaign Management Service
    return { id: `ms_${Date.now()}`, url: `https://ui.ads.microsoft.com/campaign/vnext/` };
  },
  async status() {
    return { state: 'active', spend: 0, impressions: 0, clicks: 0 };
  },
  async stop(id) {
    console.log(`[stub] microsoft ads stop ${id}`);
  },

  setup: oauthSetup({
    secretKey: "MICROSOFT_ADS_REFRESH_TOKEN",
    label: "Microsoft Ads (Bing)",
    vendorDocUrl: "https://ads.microsoft.com/",
    steps: [
      "Open ads.microsoft.com \u2192 sign up for ads account",
      "Register an Azure AD app with the Bing Ads API permission",
      "Complete OAuth and paste the refresh token",
    ],
  }),
});
