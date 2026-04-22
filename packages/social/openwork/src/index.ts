import { defineSocial } from '@profullstack/sh1pt-core';

// Openwork — no public API documentation available to me; placeholder
// adapter. Fill in `requires`, auth, and endpoint URLs once docs are
// provided. Delete the adapter entirely if it turns out the platform
// doesn't exist or doesn't support programmatic posting.
interface Config {
  // TODO: fill in once API docs are available
}

export default defineSocial<Config>({
  id: 'social-openwork',
  label: 'Openwork',
  requires: { maxBodyChars: 5000, maxHashtags: 10, hashtagsInBody: true },
  async connect(ctx) {
    if (!ctx.secret('OPENWORK_TOKEN')) throw new Error('OPENWORK_TOKEN not in vault');
    return { accountId: 'openwork' };
  },
  async post(ctx, post) {
    ctx.log(`openwork post (stub — needs API docs)`);
    if (ctx.dryRun) return { id: 'dry-run', url: '', platform: 'openwork', publishedAt: new Date().toISOString() };
    return { id: `openwork_${Date.now()}`, url: '', platform: 'openwork', publishedAt: new Date().toISOString() };
  },
});
