import { defineSocial, adaptPost } from '@profullstack/sh1pt-core';

// X (Twitter). OAuth 1.0a or OAuth 2.0; tweet-create endpoint lives at
// api.twitter.com/2/tweets. The v2 free tier shipped with a very low
// post limit and paid tiers are expensive — browser-mode fallback via
// Playwright is a common alternative for heavy organic posting.
interface Config {
  mode: 'api' | 'browser';
  username?: string;           // for browser mode
  captchaSolver?: 'captcha-2captcha' | 'captcha-solver';
}

export default defineSocial<Config>({
  id: 'social-x',
  label: 'X (Twitter)',
  requires: { maxBodyChars: 280, maxHashtags: 10, hashtagsInBody: true },

  async connect(ctx, config) {
    if (config.mode === 'api' && !ctx.secret('X_BEARER_TOKEN')) {
      throw new Error('X_BEARER_TOKEN not in vault — `sh1pt secret set X_BEARER_TOKEN`');
    }
    if (config.mode === 'browser' && (!ctx.secret('X_EMAIL') || !ctx.secret('X_PASSWORD'))) {
      throw new Error('browser mode needs X_EMAIL + X_PASSWORD in vault');
    }
    return { accountId: config.username ?? 'x' };
  },

  async post(ctx, post) {
    const { body } = adaptPost(post, {
      id: 'social-x', label: 'X', requires: { maxBodyChars: 280, maxHashtags: 10, hashtagsInBody: true },
    } as any);
    ctx.log(`x post · ${body.length} chars · media=${post.media?.length ?? 0}`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://x.com/', platform: 'x', publishedAt: new Date().toISOString() };
    // TODO:
    //   api: POST /2/tweets with { text, media: { media_ids } } — upload media first via /1.1/media/upload
    //   browser: Playwright → compose tweet → attach media → publish
    return { id: `x_${Date.now()}`, url: 'https://x.com/', platform: 'x', publishedAt: new Date().toISOString() };
  },
});
