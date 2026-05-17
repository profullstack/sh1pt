import { defineSocial, tokenSetup } from '@profullstack/sh1pt-core';

// Generic Nostr publisher. Auth is an nsec (bech32-encoded secret key) —
// no OAuth, no API key, just sign-and-broadcast. Posts are kind:1 (short
// text notes) by default; flip to kind:30023 for long-form articles.
// Hashtags map to indexed 't' tags. Sibling-aware: shares NOSTR_NSEC with
// social-primal / social-blossom / bridge-nostr.
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social',
];

interface Config {
  relays?: string[];
  kind?: 'note' | 'article';
}

export default defineSocial<Config>({
  id: 'social-nostr',
  label: 'Nostr',
  requires: { maxBodyChars: 10_000, maxHashtags: 30, hashtagsInBody: true },

  async connect(ctx) {
    if (!ctx.secret('NOSTR_NSEC')) throw new Error('NOSTR_NSEC not in vault (your Nostr secret key, bech32-encoded)');
    return { accountId: 'nostr' };
  },

  async post(ctx, post, config) {
    const relays = config.relays ?? DEFAULT_RELAYS;
    const kind = config.kind === 'article' ? 30023 : 1;
    ctx.log(`nostr · kind=${kind} · relays=${relays.length} · ${post.body.length} chars`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://nostr.com/', platform: 'nostr', publishedAt: new Date().toISOString() };
    // TODO:
    //   1. decode nsec → 32-byte private key (NIP-19)
    //   2. build event { kind, content, tags: [['t', tag], ...], created_at, pubkey }
    //   3. compute id = sha256(serialize(event)), sig = schnorr-sign(privkey, id)
    //   4. open WebSocket to each relay, send ["EVENT", event], wait for ["OK", id, true, ""]
    return { id: `nostr_${Date.now()}`, url: 'https://nostr.com/', platform: 'nostr', publishedAt: new Date().toISOString() };
  },

  setup: tokenSetup({
    secretKey: 'NOSTR_NSEC',
    label: 'Nostr',
    vendorDocUrl: 'https://nostr.com/',
    steps: [
      'Generate an nsec in any Nostr client (Damus, Amethyst, Primal, nostr-tools, etc.)',
      'Or import an existing one — same nsec works across every Nostr client and relay',
      'Paste the nsec (starts with "nsec1…") below — sh1pt encrypts it in the vault',
      '⚠ Lose this key = lose the account. Back it up separately (paper, password manager, hardware signer).',
    ],
  }),
});
