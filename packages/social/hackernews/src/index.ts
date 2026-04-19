import { defineSocial } from '@sh1pt/core';

// Hacker News — no write API. Submissions go through the web form at
// news.ycombinator.com/submit. Browser-mode only. HN is extremely
// aggressive about anti-spam: one submission per day max, no marketing
// speak, no emojis, use "Show HN:" prefix for launches. One flag and
// the account is shadow-banned for months.
interface Config {
  mode: 'browser';
  username: string;
  submissionType?: 'link' | 'show' | 'ask';
}

export default defineSocial<Config>({
  id: 'social-hackernews',
  label: 'Hacker News',
  requires: { maxBodyChars: 80, maxHashtags: 0 },    // title-only, no hashtags ever
  async connect(ctx, config) {
    if (!ctx.secret('HN_USERNAME') || !ctx.secret('HN_PASSWORD')) {
      throw new Error('HN_USERNAME + HN_PASSWORD required in vault (browser-mode only)');
    }
    return { accountId: config.username };
  },
  async post(ctx, post, config) {
    if ((post.body?.length ?? 0) > 80) ctx.log('HN titles over 80 chars tend to fail the front page heuristic', 'warn');
    ctx.log(`hackernews ${config.submissionType ?? 'show'} · "${post.body?.slice(0, 60)}…"`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://news.ycombinator.com/', platform: 'hackernews', publishedAt: new Date().toISOString() };
    // TODO: Playwright → /login → /submit. Enforce 1/day per user in the call site.
    return { id: `hn_${Date.now()}`, url: 'https://news.ycombinator.com/newest', platform: 'hackernews', publishedAt: new Date().toISOString() };
  },
});
