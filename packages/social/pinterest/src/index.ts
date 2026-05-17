import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// Pinterest API v5. OAuth 2.0 with PKCE; pins live on boards owned by the
// authenticated user or business account.
interface Config {
  boardId: string;
}

export default defineSocial<Config>({
  id: 'social-pinterest',
  label: 'Pinterest',
  requires: { media: ['image', 'video'], maxBodyChars: 500, maxHashtags: 20, hashtagsInBody: true },

  async connect(ctx, config) {
    if (!ctx.secret('PINTEREST_ACCESS_TOKEN')) throw new Error('PINTEREST_ACCESS_TOKEN not in vault');
    return { accountId: config.boardId };
  },

  async post(ctx, post, config) {
    if (!post.media?.length) {
      throw new Error('Pinterest requires at least one image or video');
    }
    ctx.log(`pinterest pin · board=${config.boardId} · media=${post.media.length}`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://pinterest.com/', platform: 'pinterest', publishedAt: new Date().toISOString() };
    // TODO: POST /v5/pins with { board_id, media_source: { source_type: 'image_url'|'video_id', url } }
    return { id: `pin_${Date.now()}`, url: 'https://www.pinterest.com/', platform: 'pinterest', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: 'PINTEREST_ACCESS_TOKEN',
    label: 'Pinterest',
    vendorDocUrl: 'https://developers.pinterest.com/docs/api/v5/',
    steps: [
      'Open developers.pinterest.com → Apps → Create app',
      'Add redirect URI http://127.0.0.1:8765/callback and request scopes: pins:read, pins:write, boards:read',
      'Complete the OAuth flow for the target account and copy the access token',
    ],
    // Loopback PKCE — kicks in when SH1PT_PINTEREST_CLIENT_ID is set
    // (CLI publisher registers one app, ships the public client id via env).
    ...(process.env.SH1PT_PINTEREST_CLIENT_ID
      ? {
          loopback: {
            clientId: process.env.SH1PT_PINTEREST_CLIENT_ID,
            authUrl: 'https://www.pinterest.com/oauth/',
            tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
            scopes: ['pins:read', 'pins:write', 'boards:read', 'boards:write', 'user_accounts:read'],
          },
        }
      : {}),
  }),
});
