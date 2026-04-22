import { defineSocial } from '@profullstack/sh1pt-core';

// The Colony — no public API documentation available to me; placeholder
// adapter. Fill in `requires`, auth, and endpoint URLs once docs are
// provided. Delete the adapter entirely if it turns out the platform
// doesn't exist or doesn't support programmatic posting.
interface Config {
  // TODO: fill in once API docs are available
}

export default defineSocial<Config>({
  id: 'social-the-colony',
  label: 'The Colony',
  requires: { maxBodyChars: 5000, maxHashtags: 10, hashtagsInBody: true },
  async connect(ctx) {
    if (!ctx.secret('THE_COLONY_TOKEN')) throw new Error('THE_COLONY_TOKEN not in vault');
    return { accountId: 'the-colony' };
  },
  async post(ctx, post) {
    ctx.log(`the-colony post (stub — needs API docs)`);
    if (ctx.dryRun) return { id: 'dry-run', url: '', platform: 'the-colony', publishedAt: new Date().toISOString() };
    return { id: `the-colony_${Date.now()}`, url: '', platform: 'the-colony', publishedAt: new Date().toISOString() };
  },
});
