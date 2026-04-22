import { defineAdPlatform } from '@profullstack/sh1pt-core';

// Kickstarter — reward-based crowdfunding for physical + digital
// products. No public project-creation API; dashboard is browser-only.
// What sh1pt CAN automate: backer updates, reward-tier sync, comment
// moderation. Project launch + Form W-9 / ID verification is manual.
interface Config {
  mode: 'browser';
  projectSlug?: string;
  captchaSolver?: 'captcha-2captcha' | 'captcha-solver';
}

export default defineAdPlatform<Config>({
  id: 'promo-kickstarter',
  label: 'Kickstarter (reward-based crowdfunding)',
  async connect(ctx) {
    if (!ctx.secret('KICKSTARTER_EMAIL') || !ctx.secret('KICKSTARTER_PASSWORD')) {
      throw new Error('KICKSTARTER_EMAIL + KICKSTARTER_PASSWORD required in vault');
    }
    return { accountId: 'kickstarter' };
  },
  async start(ctx, config) {
    ctx.log(`kickstarter · project=${config.projectSlug ?? '(manual creation required)'}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: browser-mode backer updates / reward tier edits.
    // Cannot launch a new project — that flow requires manual KYC + bank
    // linking that sh1pt shouldn't automate.
    return { id: `ks_${Date.now()}`, url: `https://www.kickstarter.com/projects/${config.projectSlug ?? ''}` };
  },
  async status() { return { state: 'active', spend: 0, impressions: 0, clicks: 0 }; },
  async stop(id) { console.log(`[stub] kickstarter ${id}`); },
});
