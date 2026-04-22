import { defineSocial } from '@profullstack/sh1pt-core';

// Moltexchange — no public API documentation available to me; placeholder
// adapter. Fill in `requires`, auth, and endpoint URLs once docs are
// provided. Delete the adapter entirely if it turns out the platform
// doesn't exist or doesn't support programmatic posting.
interface Config {
  // TODO: fill in once API docs are available
}

export default defineSocial<Config>({
  id: 'social-moltexchange',
  label: 'Moltexchange',
  requires: { maxBodyChars: 5000, maxHashtags: 10, hashtagsInBody: true },
  async connect(ctx) {
    if (!ctx.secret('MOLTEXCHANGE_TOKEN')) throw new Error('MOLTEXCHANGE_TOKEN not in vault');
    return { accountId: 'moltexchange' };
  },
  async post(ctx, post) {
    ctx.log(`moltexchange post (stub — needs API docs)`);
    if (ctx.dryRun) return { id: 'dry-run', url: '', platform: 'moltexchange', publishedAt: new Date().toISOString() };
    return { id: `moltexchange_${Date.now()}`, url: '', platform: 'moltexchange', publishedAt: new Date().toISOString() };
  },
});
