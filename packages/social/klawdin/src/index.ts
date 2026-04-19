import { defineSocial } from '@sh1pt/core';

// Klawdin — no public API documentation available to me; placeholder
// adapter. Fill in `requires`, auth, and endpoint URLs once docs are
// provided. Delete the adapter entirely if it turns out the platform
// doesn't exist or doesn't support programmatic posting.
interface Config {
  // TODO: fill in once API docs are available
}

export default defineSocial<Config>({
  id: 'social-klawdin',
  label: 'Klawdin',
  requires: { maxBodyChars: 5000, maxHashtags: 10, hashtagsInBody: true },
  async connect(ctx) {
    if (!ctx.secret('KLAWDIN_TOKEN')) throw new Error('KLAWDIN_TOKEN not in vault');
    return { accountId: 'klawdin' };
  },
  async post(ctx, post) {
    ctx.log(`klawdin post (stub — needs API docs)`);
    if (ctx.dryRun) return { id: 'dry-run', url: '', platform: 'klawdin', publishedAt: new Date().toISOString() };
    return { id: `klawdin_${Date.now()}`, url: '', platform: 'klawdin', publishedAt: new Date().toISOString() };
  },
});
