import { defineSocial, cookieSetup } from '@profullstack/sh1pt-core';

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

  // LinkedIn's Share API needs an approved Marketing app + Company Page \u2014
  // overkill for personal posting. Browser-mode with li_at + JSESSIONID
  // works against the same /voyager/api endpoints linkedin.com/feed uses.
  setup: cookieSetup({
    label: 'LinkedIn',
    loginUrl: 'https://www.linkedin.com/login',
    cookies: [
      { name: 'li_at',      secretKey: 'LINKEDIN_LI_AT',      description: 'session token', required: true },
      { name: 'JSESSIONID', secretKey: 'LINKEDIN_JSESSIONID', description: 'CSRF token',    required: true },
    ],
    steps: [
      'JSESSIONID is wrapped in quotes \u2014 paste includes the quotes.',
      'Both cookies live on .linkedin.com \u2014 DevTools \u2192 Application \u2192 Cookies.',
    ],
  }),
});
