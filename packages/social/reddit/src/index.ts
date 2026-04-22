import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// Reddit — text/link/image submissions via /api/submit. Each subreddit
// has its own rules + karma requirements; self-promotion in the wrong
// sub is the fastest way to get an account shadow-banned.
interface Config {
  subreddit: string;           // without 'r/' prefix
  kind?: 'self' | 'link' | 'image';
  flairId?: string;
}

export default defineSocial<Config>({
  id: 'social-reddit',
  label: 'Reddit',
  requires: { maxBodyChars: 40_000, maxHashtags: 0 },   // Reddit doesn't use hashtags
  async connect(ctx) {
    if (!ctx.secret('REDDIT_CLIENT_ID') || !ctx.secret('REDDIT_CLIENT_SECRET') || !ctx.secret('REDDIT_REFRESH_TOKEN')) {
      throw new Error('Reddit needs CLIENT_ID + CLIENT_SECRET + REFRESH_TOKEN in vault');
    }
    return { accountId: 'reddit' };
  },
  async post(ctx, post, config) {
    ctx.log(`reddit submit · r/${config.subreddit} · kind=${config.kind ?? 'self'}`);
    if (ctx.dryRun) return { id: 'dry-run', url: `https://reddit.com/r/${config.subreddit}`, platform: 'reddit', publishedAt: new Date().toISOString() };
    // TODO: POST /api/submit with { sr, kind, title, text|url, flair_id }
    return { id: `rd_${Date.now()}`, url: `https://reddit.com/r/${config.subreddit}`, platform: 'reddit', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: "REDDIT_REFRESH_TOKEN",
    label: "Reddit",
    vendorDocUrl: "https://www.reddit.com/prefs/apps",
    steps: [
      "Open reddit.com/prefs/apps \u2192 create another app \u2192 script or web app",
      "Complete OAuth dance to get a refresh token (scope: submit, read)",
      "Paste the refresh token; sh1pt will exchange it for access tokens as needed",
    ],
  }),
});
