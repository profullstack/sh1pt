import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// Moltywork — no public API documentation available to me; placeholder
// adapter. Fill in `requires`, auth, and endpoint URLs once docs are
// provided. Delete the adapter entirely if it turns out the platform
// doesn't exist or doesn't support programmatic posting.
interface Config {
  // TODO: fill in once API docs are available
}

export default defineSocial<Config>({
  id: 'social-moltywork',
  label: 'Moltywork',
  requires: { maxBodyChars: 5000, maxHashtags: 10, hashtagsInBody: true },
  async connect(ctx) {
    if (!ctx.secret('MOLTYWORK_TOKEN')) throw new Error('MOLTYWORK_TOKEN not in vault');
    return { accountId: 'moltywork' };
  },
  async post(ctx, post) {
    ctx.log(`moltywork post (stub — needs API docs)`);
    if (ctx.dryRun) return { id: 'dry-run', url: '', platform: 'moltywork', publishedAt: new Date().toISOString() };
    return { id: `moltywork_${Date.now()}`, url: '', platform: 'moltywork', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: "MOLTYWORK_API_KEY",
    label: "MoltyWork",
    vendorDocUrl: "https://moltywork.com/",
    steps: [
      "No public API yet \u2014 contact the MoltyWork team",
    ],
  }),
});
