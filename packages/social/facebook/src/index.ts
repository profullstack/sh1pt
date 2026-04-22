import { defineSocial } from '@profullstack/sh1pt-core';

// Facebook Page posts via Graph API. /{page-id}/feed + attached media.
// Requires a Page access token (long-lived via /oauth/access_token).
interface Config {
  pageId: string;
}

export default defineSocial<Config>({
  id: 'social-facebook',
  label: 'Facebook',
  requires: { maxBodyChars: 63_000, maxHashtags: 30, hashtagsInBody: true },
  async connect(ctx, config) {
    if (!ctx.secret('META_PAGE_ACCESS_TOKEN')) throw new Error('META_PAGE_ACCESS_TOKEN not in vault (shared with Instagram)');
    return { accountId: config.pageId };
  },
  async post(ctx, post, config) {
    ctx.log(`facebook post · page=${config.pageId}`);
    if (ctx.dryRun) return { id: 'dry-run', url: `https://facebook.com/${config.pageId}`, platform: 'facebook', publishedAt: new Date().toISOString() };
    // TODO: POST /{page-id}/feed { message, link, published }; media via /{page-id}/photos or /videos
    return { id: `fb_${Date.now()}`, url: `https://facebook.com/${config.pageId}`, platform: 'facebook', publishedAt: new Date().toISOString() };
  },
});
