import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// Twitch Helix API. OAuth 2.0; "post" here means stream announcements,
// channel updates, and chat messages via the Helix /chat/messages endpoint.
interface Config {
  broadcasterId: string;
}

export default defineSocial<Config>({
  id: 'social-twitch',
  label: 'Twitch',
  requires: { maxBodyChars: 500, maxHashtags: 0, hashtagsInBody: true },

  async connect(ctx, config) {
    if (!ctx.secret('TWITCH_ACCESS_TOKEN')) throw new Error('TWITCH_ACCESS_TOKEN not in vault');
    return { accountId: config.broadcasterId };
  },

  async post(ctx, post, config) {
    ctx.log(`twitch chat/announcement · broadcaster=${config.broadcasterId} · ${post.body.length} chars`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://twitch.tv/', platform: 'twitch', publishedAt: new Date().toISOString() };
    // TODO: POST /helix/chat/announcements (broadcaster scope) or PATCH /helix/channels for stream title/category updates.
    return { id: `tw_${Date.now()}`, url: 'https://www.twitch.tv/', platform: 'twitch', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: 'TWITCH_ACCESS_TOKEN',
    label: 'Twitch',
    vendorDocUrl: 'https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/',
    steps: [
      'Open dev.twitch.tv → Console → Applications → Register Your Application',
      'Add OAuth redirect URL http://127.0.0.1:8765/callback and select scopes: chat:edit, channel:manage:broadcast, moderator:manage:announcements',
      'Run the auth flow as the broadcaster account and copy the access token',
    ],
    ...(process.env.SH1PT_TWITCH_CLIENT_ID
      ? {
          loopback: {
            clientId: process.env.SH1PT_TWITCH_CLIENT_ID,
            authUrl: 'https://id.twitch.tv/oauth2/authorize',
            tokenUrl: 'https://id.twitch.tv/oauth2/token',
            scopes: ['chat:edit', 'channel:manage:broadcast', 'moderator:manage:announcements'],
          },
        }
      : {}),
  }),
});
