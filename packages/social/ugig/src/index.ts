import { defineSocial } from '@profullstack/sh1pt-core';

// Ugig — no public API documentation available to me; placeholder
// adapter. Fill in `requires`, auth, and endpoint URLs once docs are
// provided. Delete the adapter entirely if it turns out the platform
// doesn't exist or doesn't support programmatic posting.
interface Config {
  // TODO: fill in once API docs are available
}

export default defineSocial<Config>({
  id: 'social-ugig',
  label: 'Ugig',
  requires: { maxBodyChars: 5000, maxHashtags: 10, hashtagsInBody: true },
  async connect(ctx) {
    if (!ctx.secret('UGIG_TOKEN')) throw new Error('UGIG_TOKEN not in vault');
    return { accountId: 'ugig' };
  },
  async post(ctx, post) {
    ctx.log(`ugig post (stub — needs API docs)`);
    if (ctx.dryRun) return { id: 'dry-run', url: '', platform: 'ugig', publishedAt: new Date().toISOString() };
    return { id: `ugig_${Date.now()}`, url: '', platform: 'ugig', publishedAt: new Date().toISOString() };
  },
});
