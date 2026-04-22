import { defineAdPlatform } from '@profullstack/sh1pt-core';

interface Config {
  accountId: string;
  fundingInstrumentId: string;
  promotedTweetIds?: string[];           // existing tweet ids to promote
}

export default defineAdPlatform<Config>({
  id: 'promo-x',
  label: 'X Ads (Twitter)',
  async connect(ctx, config) {
    ctx.log(`connect x · account=${config.accountId}`);
    // TODO: X Ads API OAuth 1.0a (three-legged) — historically required, check current API version
    return { accountId: config.accountId };
  },
  async start(ctx, config) {
    ctx.log(`x campaign · objective=${ctx.objective}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: POST /accounts/:id/campaigns + /line_items + /promoted_tweets
    return { id: `x_${Date.now()}`, url: `https://ads.x.com/accounts/${config.accountId}` };
  },
  async status() {
    return { state: 'active', spend: 0, impressions: 0, clicks: 0 };
  },
  async stop(id) {
    console.log(`[stub] x stop ${id}`);
  },
});
