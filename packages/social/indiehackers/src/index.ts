import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// Indie Hackers — no public write API. Milestone posts, product launches,
// and forum threads go through the web UI (browser-mode).
interface Config {
  mode: 'browser';
  productId?: string;
  kind?: 'post' | 'milestone' | 'launch';
}

export default defineSocial<Config>({
  id: 'social-indiehackers',
  label: 'Indie Hackers',
  requires: { maxBodyChars: 20_000, maxHashtags: 10, hashtagsInBody: true },
  async connect(ctx) {
    if (!ctx.secret('IH_EMAIL') || !ctx.secret('IH_PASSWORD')) {
      throw new Error('IH_EMAIL + IH_PASSWORD required in vault');
    }
    return { accountId: 'indiehackers' };
  },
  async post(ctx, post, config) {
    ctx.log(`indiehackers ${config.kind ?? 'post'}`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://www.indiehackers.com/', platform: 'indiehackers', publishedAt: new Date().toISOString() };
    // TODO: Playwright → /login → write post / milestone / product launch
    return { id: `ih_${Date.now()}`, url: 'https://www.indiehackers.com/', platform: 'indiehackers', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: "INDIEHACKERS_SESSION",
    label: "Indie Hackers",
    vendorDocUrl: "https://www.indiehackers.com/",
    steps: [
      "No public API \u2014 browser-mode posting via playwright",
      "sh1pt will prompt for your IH email + password on first run, OR paste a session cookie here",
    ],
  }),
});
