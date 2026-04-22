import { defineSocial } from '@profullstack/sh1pt-core';

// DEV Community (dev.to) — clean REST API at dev.to/api. Articles are
// markdown; tags are native (not hashtags). Auth: API key from user
// settings.
interface Config {
  organizationId?: number;      // post on behalf of an org
  published?: boolean;          // false = draft
  canonicalUrl?: string;        // set when cross-posting from your own blog
}

export default defineSocial<Config>({
  id: 'social-devto',
  label: 'DEV Community (dev.to)',
  requires: { maxHashtags: 4, hashtagsInBody: false },    // DEV uses "tags", max 4
  async connect(ctx) {
    if (!ctx.secret('DEVTO_API_KEY')) throw new Error('DEVTO_API_KEY not in vault (dev.to/settings/extensions → Generate API Key)');
    return { accountId: 'devto' };
  },
  async post(ctx, post, config) {
    if (!post.title) throw new Error('dev.to requires a title');
    ctx.log(`dev.to article · "${post.title}"`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://dev.to/', platform: 'devto', publishedAt: new Date().toISOString() };
    // TODO: POST https://dev.to/api/articles { article: { title, body_markdown, published, tags, canonical_url, organization_id } }
    return { id: `dev_${Date.now()}`, url: 'https://dev.to/', platform: 'devto', publishedAt: new Date().toISOString() };
  },
});
