import { defineAdPlatform } from '@profullstack/sh1pt-core';

// AngelList / AngelList Talent / AngelList Venture — investor discovery,
// SPVs, Rolling Funds. Public write-API is limited; most automation is
// browser-mode (same pattern as capitalreach).
interface Config {
  mode: 'api' | 'browser';
  companySlug?: string;          // the startup's AL page to pitch against
  captchaSolver?: 'captcha-2captcha' | 'captcha-solver';
  sendsPerHour?: number;
}

export default defineAdPlatform<Config>({
  id: 'promo-angellist',
  label: 'AngelList (investor discovery + SPVs)',
  async connect(ctx, config) {
    const key = config.mode === 'api' ? 'ANGELLIST_API_KEY' : 'ANGELLIST_EMAIL';
    if (!ctx.secret(key)) throw new Error(`${key} not in vault — \`sh1pt secret set ${key}\``);
    return { accountId: config.companySlug ?? 'angellist' };
  },
  async start(ctx) {
    ctx.log('angellist outreach · browser mode requires polite pacing');
    if (ctx.dryRun) return { id: 'dry-run' };
    return { id: `al_${Date.now()}`, url: 'https://angel.co/' };
  },
  async status() { return { state: 'active', spend: 0, impressions: 0, clicks: 0 }; },
  async stop(id) { console.log(`[stub] angellist stop ${id}`); },
});
