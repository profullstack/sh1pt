import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// CodeNewbie Community — runs on Forem. Functionally the same API as
// social-forem pointed at community.codenewbie.org, but kept as its
// own adapter so the badge + setup flow are explicit.
interface Config {}

export default defineSocial<Config>({
  id: 'social-codenewbie',
  label: 'CodeNewbie',
  requires: { maxHashtags: 4, hashtagsInBody: false },
  async connect(ctx) {
    if (!ctx.secret('CODENEWBIE_API_KEY')) throw new Error('CODENEWBIE_API_KEY not in vault');
    return { accountId: 'codenewbie' };
  },
  async post(ctx, post) {
    if (!post.title) throw new Error('CodeNewbie requires a title');
    ctx.log(`codenewbie article · "${post.title}"`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://community.codenewbie.org/', platform: 'codenewbie', publishedAt: new Date().toISOString() };
    // TODO: POST https://community.codenewbie.org/api/articles
    return { id: `cn_${Date.now()}`, url: 'https://community.codenewbie.org/', platform: 'codenewbie', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: "CODENEWBIE_API_KEY",
    label: "CodeNewbie",
    vendorDocUrl: "https://www.codenewbie.org/",
    steps: [
      "CodeNewbie runs on Forem \u2014 use a Forem API key from their instance",
    ],
  }),
});
