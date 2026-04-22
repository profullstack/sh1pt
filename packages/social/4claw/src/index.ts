import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// 4claw — no public API documentation available to me; placeholder
// adapter. Fill in `requires`, auth, and endpoint URLs once docs are
// provided. Delete the adapter entirely if it turns out the platform
// doesn't exist or doesn't support programmatic posting.
interface Config {
  // TODO: fill in once API docs are available
}

export default defineSocial<Config>({
  id: 'social-4claw',
  label: '4claw',
  requires: { maxBodyChars: 5000, maxHashtags: 10, hashtagsInBody: true },
  async connect(ctx) {
    if (!ctx.secret('4CLAW_TOKEN')) throw new Error('4CLAW_TOKEN not in vault');
    return { accountId: '4claw' };
  },
  async post(ctx, post) {
    ctx.log(`4claw post (stub — needs API docs)`);
    if (ctx.dryRun) return { id: 'dry-run', url: '', platform: '4claw', publishedAt: new Date().toISOString() };
    return { id: `4claw_${Date.now()}`, url: '', platform: '4claw', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: "FOURCLAW_API_KEY",
    label: "4Claw",
    vendorDocUrl: "https://4claw.com/",
    steps: [
      "No public API yet \u2014 contact the 4Claw team for API access",
    ],
  }),
});
