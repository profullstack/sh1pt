import { defineAdPlatform } from '@sh1pt/core';

// TikTok Ads — best CPI for mobile apps in 2024+. Requires video
// creatives (static images auto-wrapped in basic templates but
// underperform). Authenticated via TikTok for Business OAuth.
interface Config {
  advertiserId: string;
  appId?: string;                        // TikTok App ID for install campaigns
  pixelId?: string;                      // for web conversions
  targetingGroups?: string[];            // TikTok interest category ids
}

export default defineAdPlatform<Config>({
  id: 'promo-tiktok',
  label: 'TikTok Ads',
  async connect(ctx, config) {
    ctx.log(`connect tiktok · advertiser=${config.advertiserId}`);
    // TODO: TikTok for Business OAuth; store TIKTOK_ACCESS_TOKEN in secrets
    return { accountId: config.advertiserId };
  },
  async start(ctx, config) {
    const hasVideo = ctx.creatives.some((c) => c.video);
    if (!hasVideo) ctx.log('no video creative — TikTok will wrap static images, expect low CTR', 'warn');
    ctx.log(`tiktok campaign · objective=${ctx.objective} · ${ctx.budget.amount}/${ctx.budget.cadence}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: TikTok Marketing API v1.3 — /campaign/create → /adgroup → /ad
    // For objective=install, objective_type=APP_INSTALL + app_id
    return { id: `tt_${Date.now()}`, url: `https://ads.tiktok.com/i18n/perf/campaign?aadvid=${config.advertiserId}` };
  },
  async status() {
    return { state: 'active', spend: 0, impressions: 0, clicks: 0 };
  },
  async stop(id) {
    console.log(`[stub] tiktok stop ${id}`);
  },
});
