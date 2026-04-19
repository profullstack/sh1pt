import { defineSocial } from '@sh1pt/core';

// Medium — the Medium Integration API is deprecated for new apps
// (as of 2023). Existing integration tokens still work; new accounts
// have no API. Default to browser mode; `apiToken` config enables
// legacy API if a user still has one.
interface Config {
  mode: 'api-legacy' | 'browser';
  publicationId?: string;
  canonicalUrl?: string;
}

export default defineSocial<Config>({
  id: 'social-medium',
  label: 'Medium',
  requires: { maxHashtags: 5, hashtagsInBody: false },
  async connect(ctx, config) {
    if (config.mode === 'api-legacy') {
      if (!ctx.secret('MEDIUM_INTEGRATION_TOKEN')) throw new Error('MEDIUM_INTEGRATION_TOKEN not in vault (legacy-only; new tokens no longer issued)');
    } else {
      if (!ctx.secret('MEDIUM_EMAIL') || !ctx.secret('MEDIUM_PASSWORD')) {
        throw new Error('MEDIUM_EMAIL + MEDIUM_PASSWORD required in vault (browser mode)');
      }
    }
    return { accountId: 'medium' };
  },
  async post(ctx, post, config) {
    if (!post.title) throw new Error('Medium requires a title');
    ctx.log(`medium post · ${config.mode} · "${post.title}"`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://medium.com/', platform: 'medium', publishedAt: new Date().toISOString() };
    // TODO: api-legacy → POST /v1/users/:id/posts (or /publications/:id/posts)
    //       browser      → Playwright compose flow
    return { id: `med_${Date.now()}`, url: 'https://medium.com/', platform: 'medium', publishedAt: new Date().toISOString() };
  },
});
