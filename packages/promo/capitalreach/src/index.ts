import { defineAdPlatform } from '@sh1pt/core';

// CapitalReach (capitalreach.ai) — investor-outreach automation. Finds
// relevant angels/seed/VC funds by sector/stage/check-size, personalizes
// intros from a pitch deck + one-pager, tracks replies and meetings.
//
// Modelled as an AdPlatform-style adapter because the shape fits: connect
// once, kick off a targeted campaign, watch metrics (reply rate, meetings
// booked) come back. sh1pt promote investors uses this under the hood.
interface Config {
  workspaceId?: string;
  pitchDeck?: string;                   // path or URL
  onePager?: string;
  stage?: 'pre-seed' | 'seed' | 'series-a' | 'series-b';
  sectors?: string[];                   // e.g. ['devtools','ai','infra']
  checkSizeMin?: number;                // USD
  checkSizeMax?: number;
  // Filter to investors who lead (vs only follow). Lead finds are rarer
  // and worth targeting separately.
  leadsOnly?: boolean;
}

export default defineAdPlatform<Config>({
  id: 'promo-capitalreach',
  label: 'CapitalReach (investor outreach)',

  async connect(ctx, config) {
    if (!ctx.secret('CAPITALREACH_API_KEY')) {
      throw new Error('CAPITALREACH_API_KEY not set — `sh1pt secret set CAPITALREACH_API_KEY ...`');
    }
    ctx.log(`capitalreach connected · workspace=${config.workspaceId ?? '(default)'}`);
    return { accountId: config.workspaceId ?? 'capitalreach' };
  },

  async start(ctx, config) {
    ctx.log(
      `capitalreach outreach · stage=${config.stage ?? 'seed'} · ` +
      `sectors=${config.sectors?.join(',') ?? 'any'} · ` +
      `check=$${config.checkSizeMin ?? 25}k-$${config.checkSizeMax ?? 250}k` +
      (config.leadsOnly ? ' · leads-only' : ''),
    );
    if (!config.pitchDeck) ctx.log('no pitchDeck configured — intros will be thin; consider adding one', 'warn');
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO:
    //   1. POST /v1/campaigns  → create with filters (stage/sector/check-size/leads)
    //   2. Upload pitchDeck + onePager assets, attach to campaign
    //   3. Generate personalized intros for each investor (model decides firm + partner)
    //   4. Schedule sends at polite hours in target timezone
    //   5. Return campaign id so `sh1pt promote investors status` can poll
    return {
      id: `cr_${Date.now()}`,
      url: 'https://app.capitalreach.ai/campaigns',
    };
  },

  async status() {
    // Returned metrics mean something different than for ads:
    //   impressions = intros sent, clicks = replies received,
    //   installs = meetings booked, conversions = term sheets
    return { state: 'active', spend: 0, impressions: 0, clicks: 0, installs: 0 };
  },

  async stop(id) {
    console.log(`[stub] capitalreach pause campaign ${id}`);
  },
});
