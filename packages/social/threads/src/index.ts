import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// Threads (Meta). Public API launched 2024. Same auth pattern as
// Instagram / Facebook Graph but a distinct endpoint surface.
interface Config {
  threadsUserId: string;
}

export default defineSocial<Config>({
  id: 'social-threads',
  label: 'Threads',
  requires: { maxBodyChars: 500, maxHashtags: 10, hashtagsInBody: true },
  async connect(ctx, config) {
    if (!ctx.secret('THREADS_ACCESS_TOKEN')) throw new Error('THREADS_ACCESS_TOKEN not in vault');
    return { accountId: config.threadsUserId };
  },
  async post(ctx, post, config) {
    ctx.log(`threads post · ${post.body.length} chars`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://threads.net/', platform: 'threads', publishedAt: new Date().toISOString() };
    // TODO: POST /{threadsUserId}/threads with { media_type: TEXT|IMAGE|VIDEO, text, image_url } → container
    // then POST /{threadsUserId}/threads_publish with { creation_id }
    return { id: `th_${Date.now()}`, url: 'https://www.threads.net/', platform: 'threads', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: "THREADS_ACCESS_TOKEN",
    label: "Threads",
    vendorDocUrl: "https://developers.facebook.com/docs/threads",
    steps: [
      "Open developers.facebook.com \u2192 Apps \u2192 Create App",
      "Add the Threads API product and configure redirect URIs",
      "Complete the OAuth flow for the target Threads account",
    ],
  }),
});
