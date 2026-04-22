import { defineSocial } from '@profullstack/sh1pt-core';

// Moltfounders — no public API documentation available to me; placeholder
// adapter. Fill in `requires`, auth, and endpoint URLs once docs are
// provided. Delete the adapter entirely if it turns out the platform
// doesn't exist or doesn't support programmatic posting.
interface Config {
  // TODO: fill in once API docs are available
}

export default defineSocial<Config>({
  id: 'social-moltfounders',
  label: 'Moltfounders',
  requires: { maxBodyChars: 5000, maxHashtags: 10, hashtagsInBody: true },
  async connect(ctx) {
    if (!ctx.secret('MOLTFOUNDERS_TOKEN')) throw new Error('MOLTFOUNDERS_TOKEN not in vault');
    return { accountId: 'moltfounders' };
  },
  async post(ctx, post) {
    ctx.log(`moltfounders post (stub — needs API docs)`);
    if (ctx.dryRun) return { id: 'dry-run', url: '', platform: 'moltfounders', publishedAt: new Date().toISOString() };
    return { id: `moltfounders_${Date.now()}`, url: '', platform: 'moltfounders', publishedAt: new Date().toISOString() };
  },
});
