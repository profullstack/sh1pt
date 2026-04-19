import { defineAdPlatform } from '@sh1pt/core';

// Reddit Ads. Strong for niche subreddit targeting (developer tools,
// gaming, hobbies). Two ad formats: promoted posts and conversation-
// placement video. Authenticated via OAuth (ads.reddit.com).
interface Config {
  businessId: string;
  accountId: string;                     // ads account id
  subreddits?: string[];                 // e.g. ['r/webdev', 'r/programming']
  placementType?: 'feed' | 'conversation';
}

export default defineAdPlatform<Config>({
  id: 'promo-reddit',
  label: 'Reddit Ads',
  async connect(ctx, config) {
    ctx.log(`connect reddit · business=${config.businessId}`);
    // TODO: OAuth device-code flow; store REDDIT_ADS_TOKEN in secrets vault
    return { accountId: config.accountId };
  },
  async start(ctx, config) {
    const subs = config.subreddits?.join(', ') ?? '(broad targeting)';
    ctx.log(`reddit campaign · ${ctx.budget.amount} ${ctx.budget.currency}/${ctx.budget.cadence} · targeting ${subs}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: Reddit Ads API — create campaign → ad group → creatives → launch
    return { id: `rd_${Date.now()}`, url: `https://ads.reddit.com/accounts/${config.accountId}` };
  },
  async status() {
    return { state: 'active', spend: 0, impressions: 0, clicks: 0 };
  },
  async stop(id, config) {
    console.log(`[stub] reddit stop ${id} on ${config.accountId}`);
  },
});
