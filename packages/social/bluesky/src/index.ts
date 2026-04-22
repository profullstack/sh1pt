import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// Bluesky — AT Protocol. Auth via app password (Settings → App Passwords
// in the Bluesky app; do NOT use the main account password). Endpoint:
// com.atproto.repo.createRecord on the user's PDS.
interface Config {
  handle: string;              // e.g. 'alice.bsky.social'
  pds?: string;                // default 'https://bsky.social'
}

export default defineSocial<Config>({
  id: 'social-bluesky',
  label: 'Bluesky (AT Protocol)',
  requires: { maxBodyChars: 300, maxHashtags: 10, hashtagsInBody: true },
  async connect(ctx, config) {
    if (!ctx.secret('BLUESKY_APP_PASSWORD')) throw new Error('BLUESKY_APP_PASSWORD not in vault (create in Settings → App Passwords)');
    return { accountId: config.handle };
  },
  async post(ctx, post, config) {
    ctx.log(`bluesky post · @${config.handle} · ${post.body.length} chars`);
    if (ctx.dryRun) return { id: 'dry-run', url: `https://bsky.app/profile/${config.handle}`, platform: 'bluesky', publishedAt: new Date().toISOString() };
    // TODO: AT Proto flow — createSession → uploadBlob (per media) → createRecord app.bsky.feed.post
    return { id: `bsky_${Date.now()}`, url: `https://bsky.app/profile/${config.handle}`, platform: 'bluesky', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: "BLUESKY_APP_PASSWORD",
    label: "Bluesky",
    vendorDocUrl: "https://bsky.app/settings/app-passwords",
    steps: [
      "Open bsky.app \u2192 Settings \u2192 App Passwords \u2192 Add App Password",
      "Copy the generated app password (shown once)",
      "Use your handle (e.g. you.bsky.social) as the username",
    ],
  }),
});
