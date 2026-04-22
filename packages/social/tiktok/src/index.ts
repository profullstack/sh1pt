import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// TikTok Content Posting API. Requires app approval for direct-publish
// scope; sandbox starts as 'upload only' (user must confirm in the app).
interface Config {
  openId?: string;
  mode?: 'direct-post' | 'upload-only';
}

export default defineSocial<Config>({
  id: 'social-tiktok',
  label: 'TikTok',
  requires: { media: ['video'], maxBodyChars: 2200, maxHashtags: 30, hashtagsInBody: true },
  async connect(ctx) {
    if (!ctx.secret('TIKTOK_ACCESS_TOKEN')) throw new Error('TIKTOK_ACCESS_TOKEN not in vault');
    return { accountId: 'tiktok' };
  },
  async post(ctx, post) {
    if (!post.media?.some((m) => m.kind === 'video')) throw new Error('TikTok requires a video attachment');
    ctx.log(`tiktok post · video duration=${post.media[0]?.durationSec ?? '?'}s`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://tiktok.com/', platform: 'tiktok', publishedAt: new Date().toISOString() };
    // TODO: init upload → upload chunks → publish via /v2/post/publish/video/init then /inbox/video/init
    return { id: `tt_${Date.now()}`, url: 'https://www.tiktok.com/', platform: 'tiktok', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: "TIKTOK_ACCESS_TOKEN",
    label: "TikTok",
    vendorDocUrl: "https://developers.tiktok.com/",
    steps: [
      "Open developers.tiktok.com \u2192 Manage Apps \u2192 Create App",
      "Request the Video Publishing scope (approval required)",
      "Complete the OAuth flow for the target TikTok account",
    ],
  }),
});
