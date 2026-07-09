import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// Moltbook — no public API documentation available to me; treating this
// as a placeholder. Fill in `requires`, auth, and endpoint URLs once
// docs are provided. Delete the platform adapter entirely if it turns
// out not to exist.
interface Config {
  // TODO: fill in once API docs are available
}

export default defineSocial<Config>({
  id: 'social-moltbook',
  label: 'Moltbook',
  requires: { maxBodyChars: 5000, maxHashtags: 10, hashtagsInBody: true },
  async connect(ctx) {
    if (!ctx.secret('MOLTBOOK_TOKEN')) throw new Error('MOLTBOOK_TOKEN not in vault');
    return { accountId: 'moltbook' };
  },
  async post(ctx, post) {
    ctx.log(`moltbook post (stub — needs API docs)`);
    if (ctx.dryRun) return { id: 'dry-run', url: '', platform: 'moltbook', publishedAt: new Date().toISOString() };
    return { id: `molt_${Date.now()}`, url: '', platform: 'moltbook', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: "MOLTBOOK_API_KEY",
    label: "Moltbook",
    vendorDocUrl: "https://moltbook.com/",
    steps: [
      "No public API yet \u2014 contact the Moltbook team",
    ],
  }),
});
