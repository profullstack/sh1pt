import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// Quora — answers and Quora Spaces posts. No public write API since
// 2017; automation is browser-mode (Playwright). Quora is aggressive
// about self-promotion — answers with outbound links get silently
// down-ranked. Use for establishing authority, not direct CTAs.
interface Config {
  mode: 'browser';
  spaceSlug?: string;           // post into a specific Quora Space
}

export default defineSocial<Config>({
  id: 'social-quora',
  label: 'Quora',
  requires: { maxBodyChars: 10_000, maxHashtags: 0 },
  async connect(ctx) {
    if (!ctx.secret('QUORA_EMAIL') || !ctx.secret('QUORA_PASSWORD')) {
      throw new Error('QUORA_EMAIL + QUORA_PASSWORD required in vault');
    }
    return { accountId: 'quora' };
  },
  async post(ctx) {
    ctx.log(`quora post (browser mode, watch for link-rate-limiting)`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://quora.com/', platform: 'quora', publishedAt: new Date().toISOString() };
    // TODO: Playwright /login → compose answer or space post
    return { id: `q_${Date.now()}`, url: 'https://quora.com/', platform: 'quora', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: "QUORA_SESSION",
    label: "Quora",
    vendorDocUrl: "https://www.quora.com/",
    steps: [
      "No public write API \u2014 browser-mode posting required",
      "\u26a0 Quora aggressively rate-limits and bans automation \u2014 use rarely",
    ],
  }),
});
