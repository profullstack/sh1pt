import { defineAdPlatform, type OnboardStep, type OnboardState, oauthSetup } from '@profullstack/sh1pt-core';

// Reddit Ads. Strong for niche subreddit targeting (developer tools,
// gaming, hobbies). Two ad formats: promoted posts and conversation-
// placement video. Authenticated via OAuth (ads.reddit.com).
interface Config {
  businessId?: string;                   // Reddit Business id
  accountId?: string;                    // ads account id
  fundingInstrumentId?: string;          // payment method id (attached via ads UI)
  subreddits?: string[];                 // e.g. ['webdev', 'programming']
  placementType?: 'feed' | 'conversation';
}

export default defineAdPlatform<Config>({
  id: 'promo-reddit',
  label: 'Reddit Ads',

  async onboard(ctx, config): Promise<OnboardState> {
    ctx.log('checking Reddit Ads onboarding state…');
    const steps: OnboardStep[] = [
      {
        id: 'reddit-account',
        title: 'Reddit account (email verified)',
        description: 'Ads accounts require a verified email on the Reddit user that creates them.',
        status: 'pending',
        actionUrl: 'https://www.reddit.com/settings/account',
        estDurationMin: 2,
      },
      {
        id: 'ads-account',
        title: 'Reddit Ads account created',
        description: 'Create a business account at ads.reddit.com. Free; no approval required.',
        status: config.accountId ? 'done' : 'action-required',
        actionUrl: 'https://ads.reddit.com/register',
        estDurationMin: 3,
      },
      {
        id: 'business-info',
        title: 'Business info filled in',
        description: 'Legal name, address, country. Required before launching campaigns in most regions.',
        status: config.businessId ? 'done' : 'action-required',
        actionUrl: 'https://ads.reddit.com/accounts/business-settings',
        estDurationMin: 5,
      },
      {
        id: 'payment-method',
        title: 'Payment method (credit card or invoice)',
        description: 'Reddit bills post-pay for most accounts; prepay is an option for some regions.',
        status: config.fundingInstrumentId ? 'done' : 'action-required',
        actionUrl: 'https://ads.reddit.com/accounts/billing',
        estDurationMin: 3,
      },
      {
        id: 'api-access',
        title: 'API access + sh1pt OAuth app',
        description: 'Request Reddit Ads API access, then authorize sh1pt as an OAuth app.',
        status: 'action-required',
        actionUrl: 'https://ads-api.reddit.com/docs/',
        estDurationMin: 10,
        blockers: ['Reddit Ads API access requires a manual request form'],
      },
    ];
    const readyToRun = steps.every((s) => s.status === 'done');
    const funded = steps.find((s) => s.id === 'payment-method')?.status === 'done';
    return { platform: 'promo-reddit', accountId: config.accountId, steps, readyToRun, funded: !!funded };
  },

  async connect(ctx, config) {
    ctx.log(`connect reddit · account=${config.accountId ?? '(none)'}`);
    if (!config.accountId) throw new Error('promo-reddit: run `sh1pt promo setup --platform reddit` first');
    // TODO: OAuth 2.0 authorization-code flow; store REDDIT_ADS_ACCESS_TOKEN + refresh token
    return { accountId: config.accountId };
  },

  async start(ctx, config) {
    if (!config.accountId || !config.fundingInstrumentId) {
      throw new Error('promo-reddit: onboarding incomplete — accountId and funded payment method required');
    }
    const subs = config.subreddits?.join(', ') ?? '(broad targeting)';
    ctx.log(`reddit · ${ctx.budget.amount} ${ctx.budget.currency}/${ctx.budget.cadence} · targeting r/${subs}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: Reddit Ads API:
    //   POST /api/v3/accounts/:id/campaigns → /ad_groups → /ads
    //   Use config.fundingInstrumentId on the campaign to bind billing.
    return {
      id: `rd_${Date.now()}`,
      url: `https://ads.reddit.com/accounts/${config.accountId}`,
    };
  },

  async status() {
    return { state: 'active', spend: 0, impressions: 0, clicks: 0 };
  },

  async stop(id, config) {
    console.log(`[stub] reddit stop ${id} on ${config.accountId}`);
  },

  setup: oauthSetup({
    secretKey: "REDDIT_ADS_REFRESH_TOKEN",
    label: "Reddit Ads",
    vendorDocUrl: "https://ads.reddit.com/",
    steps: [
      "Open ads.reddit.com \u2192 Create a business account + ad account",
      "Register a script/web app at reddit.com/prefs/apps",
      "Complete OAuth with scope: ads_read ads_management",
    ],
  }),
});
