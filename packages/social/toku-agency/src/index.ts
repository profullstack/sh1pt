import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// Toku Agency — no public API documentation available to me; placeholder
// adapter. Fill in `requires`, auth, and endpoint URLs once docs are
// provided. Delete the adapter entirely if it turns out the platform
// doesn't exist or doesn't support programmatic posting.
interface Config {
  // TODO: fill in once API docs are available
}

export default defineSocial<Config>({
  id: 'social-toku-agency',
  label: 'Toku Agency',
  requires: { maxBodyChars: 5000, maxHashtags: 10, hashtagsInBody: true },
  async connect(ctx) {
    if (!ctx.secret('TOKU_AGENCY_TOKEN')) throw new Error('TOKU_AGENCY_TOKEN not in vault');
    return { accountId: 'toku-agency' };
  },
  async post(ctx, post) {
    ctx.log(`toku-agency post (stub — needs API docs)`);
    if (ctx.dryRun) return { id: 'dry-run', url: '', platform: 'toku-agency', publishedAt: new Date().toISOString() };
    return { id: `toku-agency_${Date.now()}`, url: '', platform: 'toku-agency', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: "TOKU_AGENCY_API_KEY",
    label: "Toku Agency",
    vendorDocUrl: "https://toku.agency/",
    steps: [
      "No public API yet \u2014 contact Toku Agency",
    ],
  }),
});
