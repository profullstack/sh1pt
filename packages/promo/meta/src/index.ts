import { defineAdPlatform } from '@sh1pt/core';

// Meta Ads — Facebook + Instagram + Messenger + Audience Network placements
// all run through one campaign via the Marketing API (Graph API).
// For mobile install campaigns, requires App Ads Helper + Facebook App
// Events SDK integrated in the app.
interface Config {
  adAccountId: string;                   // e.g. 'act_12345'
  pageId: string;                        // FB page backing the ads
  instagramAccountId?: string;
  placements?: ('facebook' | 'instagram' | 'messenger' | 'audience-network')[];
  pixelId?: string;                      // for web/conversion campaigns
}

export default defineAdPlatform<Config>({
  id: 'promo-meta',
  label: 'Meta Ads (Facebook / Instagram)',
  async connect(ctx, config) {
    ctx.log(`connect meta · account=${config.adAccountId}`);
    // TODO: Facebook Login OAuth → long-lived user token → system user token for server use
    return { accountId: config.adAccountId };
  },
  async start(ctx, config) {
    const placements = config.placements?.join(', ') ?? 'all placements (auto)';
    ctx.log(`meta campaign · objective=${ctx.objective} · ${placements}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: Graph API — /act_*/campaigns → /adsets → /ads with creatives
    // For objective=install, use "APP_INSTALLS" with App ID + store URL in creative.
    return { id: `fb_${Date.now()}`, url: `https://business.facebook.com/adsmanager/manage/campaigns?act=${config.adAccountId}` };
  },
  async status() {
    return { state: 'active', spend: 0, impressions: 0, clicks: 0, installs: 0 };
  },
  async stop(id) {
    console.log(`[stub] meta stop ${id}`);
  },
});
