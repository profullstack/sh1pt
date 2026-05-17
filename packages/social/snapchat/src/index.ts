import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// Snapchat — Public Stories / Spotlight via Creator Kit + Marketing API.
// OAuth 2.0; orgs that publish to a public profile must be approved.
interface Config {
  profileId: string;
}

export default defineSocial<Config>({
  id: 'social-snapchat',
  label: 'Snapchat',
  requires: { media: ['image', 'video'], maxBodyChars: 250, maxHashtags: 0, hashtagsInBody: true },

  async connect(ctx, config) {
    if (!ctx.secret('SNAPCHAT_ACCESS_TOKEN')) throw new Error('SNAPCHAT_ACCESS_TOKEN not in vault');
    return { accountId: config.profileId };
  },

  async post(ctx, post, config) {
    if (!post.media?.length) {
      throw new Error('Snapchat requires at least one image or video');
    }
    ctx.log(`snapchat snap · profile=${config.profileId} · media=${post.media.length}`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://snapchat.com/', platform: 'snapchat', publishedAt: new Date().toISOString() };
    // TODO: upload media via Creative Kit, then publish to Public Profile / Spotlight via the Marketing/Creator API.
    return { id: `sc_${Date.now()}`, url: 'https://www.snapchat.com/', platform: 'snapchat', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: 'SNAPCHAT_ACCESS_TOKEN',
    label: 'Snapchat',
    vendorDocUrl: 'https://developers.snap.com/api/marketing-api/Auth/oauth2',
    steps: [
      'Open kit.snapchat.com or business.snapchat.com → create / select your app',
      'Add redirect URI http://127.0.0.1:8765/callback and request scopes: snapchat-marketing-api, creative-kit',
      'Complete the OAuth flow for the Public Profile that owns the content',
    ],
    ...(process.env.SH1PT_SNAPCHAT_CLIENT_ID
      ? {
          loopback: {
            clientId: process.env.SH1PT_SNAPCHAT_CLIENT_ID,
            authUrl: 'https://accounts.snapchat.com/login/oauth2/authorize',
            tokenUrl: 'https://accounts.snapchat.com/login/oauth2/access_token',
            scopes: ['snapchat-marketing-api'],
          },
        }
      : {}),
  }),
});
