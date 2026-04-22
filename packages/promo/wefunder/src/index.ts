import { defineAdPlatform } from '@profullstack/sh1pt-core';

// Wefunder — US regulated equity crowdfunding (Reg CF / Reg A+). Raise
// from the public up to $5M/yr under Reg CF. No public write API; this
// adapter drives the founder-portal via browser mode (Playwright).
interface Config {
  mode: 'browser';           // no public API as of now
  companySlug?: string;
  targetRaise?: number;      // USD
  captchaSolver?: 'captcha-2captcha' | 'captcha-solver';
}

export default defineAdPlatform<Config>({
  id: 'promo-wefunder',
  label: 'Wefunder (US regulated equity crowdfunding)',
  async connect(ctx) {
    if (!ctx.secret('WEFUNDER_EMAIL') || !ctx.secret('WEFUNDER_PASSWORD')) {
      throw new Error('WEFUNDER_EMAIL + WEFUNDER_PASSWORD required in vault');
    }
    return { accountId: 'wefunder' };
  },
  async start(ctx, config) {
    ctx.log(`wefunder · target=$${config.targetRaise ?? 100_000} · browser mode`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: Playwright flow — login → open company page → post update or
    // launch a raise via the dashboard. Raises require legal form filings
    // (Form C) which sh1pt CANNOT automate for regulatory reasons.
    return { id: `wf_${Date.now()}`, url: `https://wefunder.com/${config.companySlug ?? ''}` };
  },
  async status() { return { state: 'active', spend: 0, impressions: 0, clicks: 0 }; },
  async stop(id) { console.log(`[stub] wefunder ${id}`); },
});
