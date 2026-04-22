import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// Primal — a Nostr client + long-form publishing. Auth with an nsec
// (Nostr secret key); post is a signed kind:1 event (short) or kind:30023
// (long-form) broadcast to a set of relays.
interface Config {
  relays?: string[];            // default: Primal's curated relay set
  kind?: 'note' | 'article';    // kind:1 vs kind:30023
}

export default defineSocial<Config>({
  id: 'social-primal',
  label: 'Primal (Nostr)',
  requires: { maxBodyChars: 10_000, maxHashtags: 20, hashtagsInBody: true },
  async connect(ctx) {
    if (!ctx.secret('NOSTR_NSEC')) throw new Error('NOSTR_NSEC not in vault (your Nostr secret key, bech32-encoded)');
    return { accountId: 'primal' };
  },
  async post(ctx, post, config) {
    ctx.log(`primal · kind=${config.kind ?? 'note'} · relays=${config.relays?.length ?? 'default'}`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://primal.net/', platform: 'primal', publishedAt: new Date().toISOString() };
    // TODO: build + sign event (kind 1 for notes, 30023 for articles),
    // broadcast to relays via WebSocket. Hashtags become 't' tags.
    return { id: `nostr_${Date.now()}`, url: 'https://primal.net/', platform: 'primal', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: "PRIMAL_NSEC",
    label: "Primal (Nostr)",
    vendorDocUrl: "https://primal.net/",
    steps: [
      "Nostr uses nsec private keys (not OAuth). Generate one in any Nostr client",
      "Paste your nsec (starts with \"nsec1\u2026\") \u2014 sh1pt stores it in the vault",
      "\u26a0 Lose this key = lose the account. Back it up separately.",
    ],
  }),
});
