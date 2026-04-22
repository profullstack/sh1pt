import { defineSocial } from '@profullstack/sh1pt-core';

// Blossom — Nostr-based media + short-form social app. Uses the Blossom
// protocol for media hosting and standard Nostr events (kind:1) for
// posts. Shares auth (nsec) + relay pattern with social-primal.
interface Config {
  blossomServers?: string[];    // media upload endpoints
  relays?: string[];
}

export default defineSocial<Config>({
  id: 'social-blossom',
  label: 'Blossom Social (Nostr)',
  requires: { maxBodyChars: 10_000, maxHashtags: 20, hashtagsInBody: true },
  async connect(ctx) {
    if (!ctx.secret('NOSTR_NSEC')) throw new Error('NOSTR_NSEC not in vault');
    return { accountId: 'blossom' };
  },
  async post(ctx, post) {
    ctx.log(`blossom · ${post.body.length} chars · media=${post.media?.length ?? 0}`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://blossom.primal.net/', platform: 'blossom', publishedAt: new Date().toISOString() };
    // TODO: upload media to Blossom server(s), build Nostr event with
    // resulting blob URLs, sign + broadcast to relays.
    return { id: `bl_${Date.now()}`, url: 'https://blossom.primal.net/', platform: 'blossom', publishedAt: new Date().toISOString() };
  },
});
