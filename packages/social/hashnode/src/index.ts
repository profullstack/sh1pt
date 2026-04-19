import { defineSocial } from '@sh1pt/core';

// Hashnode — GraphQL API at gql.hashnode.com. Personal blogs live on
// hashnode.dev subdomains or custom domains; posts are markdown with
// auto-SEO, RSS, newsletter. Auth: personal access token.
interface Config {
  publicationId: string;
  tags?: string[];              // max 5; each is an OBJECT id, not a string — resolve via /tags query
  canonicalUrl?: string;
}

export default defineSocial<Config>({
  id: 'social-hashnode',
  label: 'Hashnode',
  requires: { maxHashtags: 5, hashtagsInBody: false },
  async connect(ctx) {
    if (!ctx.secret('HASHNODE_TOKEN')) throw new Error('HASHNODE_TOKEN not in vault');
    return { accountId: 'hashnode' };
  },
  async post(ctx, post, config) {
    if (!post.title) throw new Error('Hashnode requires a title');
    ctx.log(`hashnode post · ${config.publicationId} · "${post.title}"`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://hashnode.com/', platform: 'hashnode', publishedAt: new Date().toISOString() };
    // TODO: GraphQL publishPost mutation with { input: { publicationId, title, contentMarkdown, tags, coverImageOptions } }
    return { id: `hn_${Date.now()}`, url: 'https://hashnode.com/', platform: 'hashnode', publishedAt: new Date().toISOString() };
  },
});
