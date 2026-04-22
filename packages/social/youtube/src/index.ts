import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// YouTube Data API v3. Upload videos (including Shorts < 60s vertical).
interface Config {
  channelId?: string;
  privacyStatus?: 'public' | 'unlisted' | 'private';
  category?: string;           // numeric category id (e.g. '28' = Science/Tech)
}

export default defineSocial<Config>({
  id: 'social-youtube',
  label: 'YouTube',
  requires: { media: ['video'], maxBodyChars: 5000, maxHashtags: 15, hashtagsInBody: true },
  async connect(ctx) {
    if (!ctx.secret('YOUTUBE_OAUTH_REFRESH_TOKEN')) throw new Error('YOUTUBE_OAUTH_REFRESH_TOKEN not in vault');
    return { accountId: 'youtube' };
  },
  async post(ctx, post, config) {
    if (!post.media?.some((m) => m.kind === 'video')) throw new Error('YouTube requires a video attachment');
    ctx.log(`youtube upload · privacy=${config.privacyStatus ?? 'public'}`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://youtube.com/', platform: 'youtube', publishedAt: new Date().toISOString() };
    // TODO: videos.insert with resumable upload; Shorts detected from duration + vertical aspect + #shorts tag
    return { id: `yt_${Date.now()}`, url: 'https://www.youtube.com/', platform: 'youtube', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: "YOUTUBE_ACCESS_TOKEN",
    label: "YouTube",
    vendorDocUrl: "https://console.cloud.google.com/apis/credentials",
    steps: [
      "Open console.cloud.google.com \u2192 APIs & Services \u2192 Enable YouTube Data API v3",
      "Create OAuth 2.0 Client credentials (Desktop or Web)",
      "Complete the OAuth flow with scope https://www.googleapis.com/auth/youtube.upload",
    ],
  }),
});
