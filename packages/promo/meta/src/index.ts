import { defineAdPlatform, type OnboardStep, type OnboardState } from '@profullstack/sh1pt-core';

// Meta Ads — Facebook + Instagram + Messenger + Audience Network placements
// all run through one campaign via the Marketing API (Graph API).
// For mobile install campaigns, requires App Ads Helper + Facebook App
// Events SDK integrated in the app.
interface Config {
  businessId?: string;                   // Business Manager id
  adAccountId?: string;                  // e.g. 'act_12345'
  pageId?: string;                       // FB page backing the ads
  instagramAccountId?: string;
  appId?: string;                        // Meta App id for install campaigns
  pixelId?: string;                      // for web/conversion campaigns
  placements?: ('facebook' | 'instagram' | 'messenger' | 'audience-network')[];
}

export default defineAdPlatform<Config>({
  id: 'promo-meta',
  label: 'Meta Ads (Facebook / Instagram)',

  async onboard(ctx, config): Promise<OnboardState> {
    ctx.log('checking Meta onboarding state…');
    // TODO: hit Graph API /me/businesses, /act_*/, etc. to detect real state.
    // Stub returns a representative checklist with real deep-links.
    const steps: OnboardStep[] = [
      {
        id: 'fb-account',
        title: 'Personal Facebook account',
        description: 'Admin steps run against a real FB login; this account becomes the initial BM admin.',
        status: 'pending',
        actionUrl: 'https://www.facebook.com/',
        estDurationMin: 2,
      },
      {
        id: 'business-manager',
        title: 'Business Manager',
        description: 'Central workspace that owns ad accounts, pages, apps, pixels, and people.',
        status: config.businessId ? 'done' : 'action-required',
        actionUrl: 'https://business.facebook.com/overview',
        estDurationMin: 5,
      },
      {
        id: 'business-verification',
        title: 'Business verification',
        description: 'Required before spend limits lift. Submit legal name, address, tax ID.',
        status: 'action-required',
        actionUrl: 'https://business.facebook.com/settings/security',
        estDurationMin: 10,
        blockers: ['Meta review can take 1–3 business days'],
      },
      {
        id: 'ad-account',
        title: 'Ad Account',
        description: 'Create inside BM. US accounts are prepay until a spend threshold is reached.',
        status: config.adAccountId ? 'done' : 'action-required',
        actionUrl: 'https://business.facebook.com/settings/ad-accounts',
        estDurationMin: 3,
      },
      {
        id: 'payment-method',
        title: 'Payment method',
        description: 'Attach a credit card or ACH direct debit.',
        status: 'action-required',
        actionUrl: config.adAccountId
          ? `https://business.facebook.com/billing_hub/payment_methods?asset_id=${config.adAccountId}`
          : 'https://business.facebook.com/billing_hub',
        estDurationMin: 3,
      },
      {
        id: 'facebook-page',
        title: 'Facebook Page linked',
        description: 'Every ad must be published by a Page — Meta will not serve ads without one.',
        status: config.pageId ? 'done' : 'action-required',
        actionUrl: 'https://www.facebook.com/pages/create',
        estDurationMin: 5,
      },
      {
        id: 'app-linked',
        title: 'App registered (for install campaigns)',
        description: 'Create a Meta App, add Facebook SDK + App Events, link to ad account.',
        status: config.appId ? 'done' : 'pending',
        actionUrl: 'https://developers.facebook.com/apps/',
        estDurationMin: 15,
      },
      {
        id: 'pixel',
        title: 'Meta Pixel (for web conversions)',
        description: 'Install the pixel snippet on your landing page and verify events fire.',
        status: config.pixelId ? 'done' : 'pending',
        actionUrl: 'https://www.facebook.com/events_manager2/list/pixel/',
        estDurationMin: 10,
      },
      {
        id: 'sh1pt-system-user',
        title: 'sh1pt system user + token',
        description: 'sh1pt needs a System User in your BM with Admin access on the ad account.',
        status: 'action-required',
        actionUrl: 'https://business.facebook.com/settings/system-users',
        estDurationMin: 5,
      },
    ];
    const required = steps.filter((s) => !['app-linked', 'pixel'].includes(s.id));
    const readyToRun = required.every((s) => s.status === 'done');
    const funded = steps.find((s) => s.id === 'payment-method')?.status === 'done';
    return { platform: 'promo-meta', accountId: config.adAccountId, steps, readyToRun, funded: !!funded };
  },

  async connect(ctx, config) {
    ctx.log(`connect meta · account=${config.adAccountId ?? '(none)'}`);
    if (!config.adAccountId) throw new Error('promo-meta: run `sh1pt promo setup --platform meta` first');
    // TODO: exchange short-lived token for long-lived, then create a system-user token for server-side use
    return { accountId: config.adAccountId };
  },

  async start(ctx, config) {
    if (!config.adAccountId || !config.pageId) {
      throw new Error('promo-meta: onboarding incomplete — adAccountId and pageId required');
    }
    const placements = config.placements?.join(', ') ?? 'all placements (automatic)';
    ctx.log(`meta · objective=${ctx.objective} · placements=${placements} · budget=${ctx.budget.amount} ${ctx.budget.currency}/${ctx.budget.cadence}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: Graph API — POST /act_*/campaigns → /adsets (targeting+budget) → /ads (creative ref)
    // Objective mapping: 'install' → OUTCOME_APP_PROMOTION, 'web-traffic' → OUTCOME_TRAFFIC,
    // 'awareness' → OUTCOME_AWARENESS, 'signup'/'purchase' → OUTCOME_LEADS/SALES
    return {
      id: `fb_${Date.now()}`,
      url: `https://business.facebook.com/adsmanager/manage/campaigns?act=${config.adAccountId}`,
    };
  },

  async status() {
    return { state: 'active', spend: 0, impressions: 0, clicks: 0, installs: 0 };
  },

  async stop(id) {
    console.log(`[stub] meta stop ${id}`);
  },
});
