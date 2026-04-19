import { defineSocial } from '@sh1pt/core';

// Secureclaw — no public API documentation available to me; placeholder
// adapter. Fill in `requires`, auth, and endpoint URLs once docs are
// provided. Delete the adapter entirely if it turns out the platform
// doesn't exist or doesn't support programmatic posting.
interface Config {
  // TODO: fill in once API docs are available
}

export default defineSocial<Config>({
  id: 'social-secureclaw',
  label: 'Secureclaw',
  requires: { maxBodyChars: 5000, maxHashtags: 10, hashtagsInBody: true },
  async connect(ctx) {
    if (!ctx.secret('SECURECLAW_TOKEN')) throw new Error('SECURECLAW_TOKEN not in vault');
    return { accountId: 'secureclaw' };
  },
  async post(ctx, post) {
    ctx.log(`secureclaw post (stub — needs API docs)`);
    if (ctx.dryRun) return { id: 'dry-run', url: '', platform: 'secureclaw', publishedAt: new Date().toISOString() };
    return { id: `secureclaw_${Date.now()}`, url: '', platform: 'secureclaw', publishedAt: new Date().toISOString() };
  },
});
