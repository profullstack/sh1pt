import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// Tumblr API v2. OAuth 1.0a (legacy) or OAuth 2.0 via the newer endpoints.
// Posts are typed (text / photo / video / link / quote / chat / audio).
interface Config {
  blogIdentifier: string;
}

export default defineSocial<Config>({
  id: 'social-tumblr',
  label: 'Tumblr',
  requires: { maxBodyChars: 4096, maxHashtags: 30, hashtagsInBody: false },

  async connect(ctx, config) {
    if (!ctx.secret('TUMBLR_ACCESS_TOKEN')) throw new Error('TUMBLR_ACCESS_TOKEN not in vault');
    return { accountId: config.blogIdentifier };
  },

  async post(ctx, post, config) {
    ctx.log(`tumblr post · blog=${config.blogIdentifier} · ${post.body.length} chars`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://tumblr.com/', platform: 'tumblr', publishedAt: new Date().toISOString() };
    // TODO: POST /v2/blog/{blog-identifier}/posts with NPF content blocks (text / image / video).
    return { id: `tu_${Date.now()}`, url: `https://${config.blogIdentifier}.tumblr.com/`, platform: 'tumblr', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: 'TUMBLR_ACCESS_TOKEN',
    label: 'Tumblr',
    vendorDocUrl: 'https://www.tumblr.com/docs/en/api/v2',
    steps: [
      'Open tumblr.com/oauth/apps → Register application',
      'Set default callback URL to http://127.0.0.1:8765/callback and request scopes: write, basic',
      'Run OAuth 2.0 authorization-code flow and paste the access token',
    ],
    ...(process.env.SH1PT_TUMBLR_CLIENT_ID
      ? {
          loopback: {
            clientId: process.env.SH1PT_TUMBLR_CLIENT_ID,
            authUrl: 'https://www.tumblr.com/oauth2/authorize',
            tokenUrl: 'https://api.tumblr.com/v2/oauth2/token',
            scopes: ['write', 'basic'],
          },
        }
      : {}),
  }),
});
