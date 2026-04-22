import { defineSocial } from '@profullstack/sh1pt-core';

// Stacker News (stacker.news) — Bitcoin Lightning-themed HN alternative.
// Submissions cost satoshis to post (anti-spam). GraphQL API at
// stacker.news/api/graphql. Auth via cookie-based login or nostr
// NIP-46 — browser-mode is the current practical path.
interface Config {
  mode: 'browser';
  territory?: string;           // e.g. 'bitcoin', 'ai', 'meta'
}

export default defineSocial<Config>({
  id: 'social-stackernews',
  label: 'Stacker News',
  requires: { maxBodyChars: 20_000, maxHashtags: 3 },
  async connect(ctx) {
    if (!ctx.secret('STACKERNEWS_COOKIE')) {
      throw new Error('STACKERNEWS_COOKIE not in vault (export cookie from logged-in browser)');
    }
    return { accountId: 'stackernews' };
  },
  async post(ctx, post, config) {
    ctx.log(`stacker news · territory=${config.territory ?? 'meta'} · note: submissions cost sats`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://stacker.news/', platform: 'stackernews', publishedAt: new Date().toISOString() };
    // TODO: POST to /api/graphql with createItem mutation — note users must
    // have satoshi balance on their SN account before calling.
    return { id: `sn_${Date.now()}`, url: 'https://stacker.news/', platform: 'stackernews', publishedAt: new Date().toISOString() };
  },
});
