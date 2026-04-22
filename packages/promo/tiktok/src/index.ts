import { defineAdPlatform, type OnboardStep, type OnboardState, oauthSetup } from '@profullstack/sh1pt-core';

// TikTok Ads — best CPI for mobile apps in 2024+. Requires video
// creatives (static images auto-wrapped in basic templates but
// underperform). Authenticated via TikTok for Business OAuth.
interface Config {
  businessCenterId?: string;             // TikTok Business Center id
  advertiserId?: string;                 // ad account
  accountMode?: 'prepay' | 'postpay';
  balance?: number;                      // remaining prepay balance (resolved at runtime)
  appId?: string;                        // TikTok App ID for install campaigns
  pixelId?: string;                      // for web conversions
  targetingGroups?: string[];            // TikTok interest category ids
}

export default defineAdPlatform<Config>({
  id: 'promo-tiktok',
  label: 'TikTok Ads',

  async onboard(ctx, config): Promise<OnboardState> {
    ctx.log('checking TikTok Ads onboarding state…');
    const steps: OnboardStep[] = [
      {
        id: 'business-account',
        title: 'TikTok for Business account',
        description: 'Sign up at business.tiktok.com with an email (not a personal TikTok login).',
        status: 'pending',
        actionUrl: 'https://business.tiktok.com/',
        estDurationMin: 3,
      },
      {
        id: 'business-center',
        title: 'Business Center workspace',
        description: 'Container for advertisers, users, and assets (like Meta Business Manager).',
        status: config.businessCenterId ? 'done' : 'action-required',
        actionUrl: 'https://business.tiktok.com/manage',
        estDurationMin: 5,
      },
      {
        id: 'advertiser-account',
        title: 'Advertiser (ad account) created',
        description: 'Choose timezone + currency carefully — these cannot be changed after creation.',
        status: config.advertiserId ? 'done' : 'action-required',
        actionUrl: 'https://business.tiktok.com/manage/advertiser',
        estDurationMin: 5,
      },
      {
        id: 'account-review',
        title: 'Advertiser review',
        description: 'New accounts are reviewed before they can serve ads (industry, landing page check).',
        status: config.advertiserId ? 'in-review' : 'blocked',
        actionUrl: config.advertiserId ? `https://ads.tiktok.com/i18n/account/info?aadvid=${config.advertiserId}` : undefined,
        estDurationMin: 60,
        blockers: ['TikTok review typically takes 1–24 hours'],
      },
      {
        id: 'payment-method',
        title: 'Payment method',
        description: 'Most regions are prepay — you load funds before ads serve. US / EU can opt into postpay with spend history.',
        status: 'action-required',
        actionUrl: config.advertiserId ? `https://ads.tiktok.com/i18n/payment/method?aadvid=${config.advertiserId}` : 'https://ads.tiktok.com/',
        estDurationMin: 3,
      },
      {
        id: 'funding',
        title: `${config.accountMode === 'postpay' ? 'Credit limit set' : 'Prepay balance funded'}`,
        description: config.accountMode === 'postpay'
          ? 'Postpay accounts bill on a credit line — monthly statements.'
          : 'Load funds into the advertiser wallet. Campaigns stop when balance hits zero.',
        status: (config.balance ?? 0) > 0 ? 'done' : 'action-required',
        actionUrl: config.advertiserId ? `https://ads.tiktok.com/i18n/payment/recharge?aadvid=${config.advertiserId}` : 'https://ads.tiktok.com/',
        estDurationMin: 5,
      },
      {
        id: 'app-linked',
        title: 'App added (install campaigns)',
        description: 'Register your iOS/Android app with TikTok. Required for objective=install. Pair with an MMP (AppsFlyer, Adjust, Branch) for attribution.',
        status: config.appId ? 'done' : 'pending',
        actionUrl: 'https://ads.tiktok.com/i18n/app/list',
        estDurationMin: 10,
      },
      {
        id: 'pixel',
        title: 'TikTok Pixel (web conversions)',
        description: 'Install the pixel on your landing page and verify events.',
        status: config.pixelId ? 'done' : 'pending',
        actionUrl: 'https://ads.tiktok.com/i18n/events_manager',
        estDurationMin: 10,
      },
      {
        id: 'sh1pt-oauth',
        title: 'sh1pt authorized',
        description: 'Grant sh1pt access via TikTok for Business OAuth. Store access + refresh tokens in the secrets vault.',
        status: 'action-required',
        actionUrl: 'https://business-api.tiktok.com/portal/auth',
        estDurationMin: 3,
      },
    ];
    const required = steps.filter((s) => !['app-linked', 'pixel'].includes(s.id));
    const readyToRun = required.every((s) => s.status === 'done');
    const funded = (config.balance ?? 0) > 0 || config.accountMode === 'postpay';
    return { platform: 'promo-tiktok', accountId: config.advertiserId, steps, readyToRun, funded };
  },

  async connect(ctx, config) {
    ctx.log(`connect tiktok · advertiser=${config.advertiserId ?? '(none)'}`);
    if (!config.advertiserId) throw new Error('promo-tiktok: run `sh1pt promo setup --platform tiktok` first');
    // TODO: TikTok for Business OAuth; exchange code for access_token + refresh_token
    return { accountId: config.advertiserId };
  },

  async start(ctx, config) {
    if (!config.advertiserId) {
      throw new Error('promo-tiktok: onboarding incomplete — advertiserId required');
    }
    if (config.accountMode !== 'postpay' && (config.balance ?? 0) <= 0) {
      throw new Error('promo-tiktok: prepay balance is zero — fund the advertiser wallet before launching');
    }
    const hasVideo = ctx.creatives.some((c) => c.video);
    if (!hasVideo) ctx.log('no video creative — TikTok will wrap static images; expect CTR 3–5× lower than native video', 'warn');
    ctx.log(`tiktok · objective=${ctx.objective} · ${ctx.budget.amount} ${ctx.budget.currency}/${ctx.budget.cadence}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: TikTok Marketing API v1.3:
    //   POST /campaign/create → /adgroup/create → /ad/create
    //   For objective=install: objective_type=APP_INSTALL, app_id=config.appId,
    //   promotion_type=APP, pick iOS or Android per placement.
    return {
      id: `tt_${Date.now()}`,
      url: `https://ads.tiktok.com/i18n/perf/campaign?aadvid=${config.advertiserId}`,
    };
  },

  async status() {
    return { state: 'active', spend: 0, impressions: 0, clicks: 0 };
  },

  async stop(id) {
    console.log(`[stub] tiktok stop ${id}`);
  },

  setup: oauthSetup({
    secretKey: "TIKTOK_ADS_ACCESS_TOKEN",
    label: "TikTok Ads",
    vendorDocUrl: "https://ads.tiktok.com/marketing_api/",
    steps: [
      "Open ads.tiktok.com \u2192 apply for Marketing API access (approval required)",
      "Register an app \u2192 complete OAuth with scope: ads.read ads.write",
    ],
  }),
});
