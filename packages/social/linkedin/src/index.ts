import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// LinkedIn API (Share on LinkedIn / UGC Post). OAuth 2.0 with r_liteprofile
// + w_member_social scopes. 3000 chars for personal posts, longer for
// Articles (separate endpoint). Hashtags count toward char budget.
interface Config {
  authorUrn?: string;          // urn:li:person:ID or urn:li:organization:ID for pages
  visibility?: 'PUBLIC' | 'CONNECTIONS';
}

export default defineSocial<Config>({
  id: 'social-linkedin',
  label: 'LinkedIn',
  requires: { maxBodyChars: 3000, maxHashtags: 30, hashtagsInBody: true },

  async connect(ctx) {
    if (!ctx.secret('LINKEDIN_ACCESS_TOKEN')) throw new Error('LINKEDIN_ACCESS_TOKEN not in vault');
    return { accountId: 'linkedin' };
  },

  async post(ctx, post, config) {
    ctx.log(`linkedin post · ${post.body.length} chars · media=${post.media?.length ?? 0}`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://www.linkedin.com/', platform: 'linkedin', publishedAt: new Date().toISOString() };
    // TODO: POST /v2/ugcPosts with lifecycleState: PUBLISHED, specificContent.shareCommentary.
    // Media must be registered via /v2/assets?action=registerUpload → uploaded → referenced by URN.
    return { id: `li_${Date.now()}`, url: `https://www.linkedin.com/`, platform: 'linkedin', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: "LINKEDIN_ACCESS_TOKEN",
    label: "LinkedIn",
    vendorDocUrl: "https://www.linkedin.com/developers/apps",
    steps: [
      "Open linkedin.com/developers/apps \u2192 Create app (requires a Company Page)",
      "Request the w_member_social product",
      "Generate a 3-legged OAuth access token (use the token generator)",
    ],
  }),
});
