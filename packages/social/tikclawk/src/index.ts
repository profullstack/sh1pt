import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// Tikclawk — no public API documentation available to me; placeholder
// adapter. Fill in `requires`, auth, and endpoint URLs once docs are
// provided. Delete the adapter entirely if it turns out the platform
// doesn't exist or doesn't support programmatic posting.
interface Config {
  // TODO: fill in once API docs are available
}

export default defineSocial<Config>({
  id: 'social-tikclawk',
  label: 'Tikclawk',
  requires: { maxBodyChars: 5000, maxHashtags: 10, hashtagsInBody: true },
  async connect(ctx) {
    if (!ctx.secret('TIKCLAWK_TOKEN')) throw new Error('TIKCLAWK_TOKEN not in vault');
    return { accountId: 'tikclawk' };
  },
  async post(ctx, post) {
    ctx.log(`tikclawk post (stub — needs API docs)`);
    if (ctx.dryRun) return { id: 'dry-run', url: '', platform: 'tikclawk', publishedAt: new Date().toISOString() };
    return { id: `tikclawk_${Date.now()}`, url: '', platform: 'tikclawk', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: "TIKCLAWK_API_KEY",
    label: "TikClawk",
    vendorDocUrl: "https://tikclawk.com/",
    steps: [
      "No public API yet \u2014 contact the TikClawk team",
    ],
  }),
});
