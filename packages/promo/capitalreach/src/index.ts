import { defineAdPlatform } from '@profullstack/sh1pt-core';

// CapitalReach (capitalreach.ai) — investor-outreach automation.
//
// ⚠ CapitalReach doesn't appear to expose a public API — the only path
// users have shipped with is the web app. Two modes:
//   1. 'api'      — if you have enterprise API access, use this
//   2. 'browser'  — Playwright automation against the web UI with an
//                   optional captcha solver (captcha-2captcha or
//                   captcha-solver) injected when challenges appear
//
// Browser mode is opt-in and rate-limited by default (10 sends/hr) to
// stay well under flag thresholds. This is a last-resort fallback for
// vendors that refuse programmatic access — respect ToS + rate limits.
interface Config {
  mode: 'api' | 'browser';
  captchaSolver?: 'captcha-2captcha' | 'captcha-solver';
  workspaceId?: string;
  pitchDeck?: string;
  onePager?: string;
  stage?: 'pre-seed' | 'seed' | 'series-a' | 'series-b';
  sectors?: string[];
  checkSizeMin?: number;
  checkSizeMax?: number;
  leadsOnly?: boolean;
  // Send throttling. Browser mode defaults low to avoid triggering
  // anti-bot heuristics. API mode defers to vendor rate limits.
  sendsPerHour?: number;
}

export default defineAdPlatform<Config>({
  id: 'promo-capitalreach',
  label: 'CapitalReach (investor outreach)',

  async connect(ctx, config) {
    if (config.mode === 'api') {
      if (!ctx.secret('CAPITALREACH_API_KEY')) {
        throw new Error('CAPITALREACH_API_KEY not in vault — run `sh1pt secret set CAPITALREACH_API_KEY`');
      }
      ctx.log('capitalreach api mode · authed');
    } else {
      if (!ctx.secret('CAPITALREACH_EMAIL') || !ctx.secret('CAPITALREACH_PASSWORD')) {
        throw new Error('browser mode needs CAPITALREACH_EMAIL + CAPITALREACH_PASSWORD in the vault');
      }
      if (!config.captchaSolver) {
        ctx.log('no captchaSolver configured — a challenge prompt will block the run', 'warn');
      }
      ctx.log(`capitalreach browser mode · solver=${config.captchaSolver ?? 'none'}`);
    }
    return { accountId: config.workspaceId ?? 'capitalreach' };
  },

  async start(ctx, config) {
    const pace = config.sendsPerHour ?? (config.mode === 'browser' ? 10 : 60);
    ctx.log(
      `capitalreach ${config.mode} · stage=${config.stage ?? 'seed'} · ` +
      `sectors=${config.sectors?.join(',') ?? 'any'} · ` +
      `check=$${config.checkSizeMin ?? 25}k-$${config.checkSizeMax ?? 250}k · ` +
      `${pace}/hr` +
      (config.leadsOnly ? ' · leads-only' : ''),
    );
    if (!config.pitchDeck) ctx.log('no pitchDeck — intros will be thin', 'warn');
    if (ctx.dryRun) return { id: 'dry-run' };

    if (config.mode === 'api') {
      // TODO: POST /v1/campaigns + upload deck + create personalized intros
    } else {
      // TODO: Playwright flow
      //   1. launch chromium (headful first time for manual 2FA setup)
      //   2. login; on captcha page, resolve via config.captchaSolver
      //   3. apply search filters, iterate pages, send intros paced to sendsPerHour
      //   4. persist run state so crashes resume rather than restart
      // Never bulk-send at max rate; accounts get flagged and the work is wasted.
    }
    return { id: `cr_${Date.now()}`, url: 'https://app.capitalreach.ai/campaigns' };
  },

  async status() {
    // impressions = intros sent, clicks = replies received,
    // installs = meetings booked, conversions = term sheets
    return { state: 'active', spend: 0, impressions: 0, clicks: 0, installs: 0 };
  },

  async stop(id) {
    console.log(`[stub] capitalreach pause ${id}`);
  },
});
