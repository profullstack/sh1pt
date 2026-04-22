import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// HackerNoon — articles pass through an editorial review, so adapter
// flow is "submit draft" rather than "publish live." No public write
// API; submissions go through hackernoon.com/draft.
interface Config {
  mode: 'browser';
  category?: string;
}

export default defineSocial<Config>({
  id: 'social-hackernoon',
  label: 'HackerNoon',
  requires: { maxHashtags: 5, hashtagsInBody: false },
  async connect(ctx) {
    if (!ctx.secret('HACKERNOON_EMAIL') || !ctx.secret('HACKERNOON_PASSWORD')) {
      throw new Error('HACKERNOON_EMAIL + HACKERNOON_PASSWORD required in vault');
    }
    return { accountId: 'hackernoon' };
  },
  async post(ctx, post) {
    if (!post.title) throw new Error('HackerNoon requires a title');
    ctx.log(`hackernoon submit draft · "${post.title}" (editorial review may take days)`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://hackernoon.com/drafts', platform: 'hackernoon', publishedAt: new Date().toISOString() };
    // TODO: Playwright /login → /draft/new → upload markdown + cover image
    return { id: `hnoon_${Date.now()}`, url: 'https://hackernoon.com/', platform: 'hackernoon', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: "HACKERNOON_API_KEY",
    label: "HackerNoon",
    vendorDocUrl: "https://app.hackernoon.com/settings",
    steps: [
      "Contact HackerNoon (api@hackernoon.com) \u2014 their API is gated to publishers",
      "Once approved, paste the API key you receive",
    ],
  }),
});
