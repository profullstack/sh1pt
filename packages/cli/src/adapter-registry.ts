// Every adapter category → (npm pkg prefix, list of adapter names).
// Mirrors the `packages/<category>/<name>/` filesystem layout so the CLI
// command tree `sh1pt <category> <name> <action>` aligns 1:1 with it.
//
// Regenerate by listing `packages/<cat>/` in the monorepo. Excluded:
//   - bots/core      (helper types, not an adapter)
//   - policy / api / sdk / web / core / cli / agent-providers
//     (not adapter categories; they're the runtime/infra layer)

export interface AdapterCategory {
  id: string;                    // CLI-facing slug, e.g. 'bots'
  pkgPrefix: string;             // npm pkg prefix, e.g. '@profullstack/sh1pt-bot'
  description: string;
  adapters: readonly string[];   // names under packages/<id>/
}

export const CATEGORIES: readonly AdapterCategory[] = [
  {
    id: 'agents',
    pkgPrefix: '@profullstack/sh1pt-agent',
    description: 'AI coding CLIs — Claude Code, Codex, Qwen',
    adapters: ['claude', 'codex', 'qwen'],
  },
  {
    id: 'bots',
    pkgPrefix: '@profullstack/sh1pt-bot',
    description: 'Chat bots — Discord, Telegram, Slack, Signal, Matrix…',
    adapters: ['discord', 'irc', 'matrix', 'phonenumbers', 'signal', 'slack', 'teams', 'telegram', 'telnyx', 'twilio', 'twitch', 'wechat', 'whatsapp'],
  },
  {
    id: 'bridges',
    pkgPrefix: '@profullstack/sh1pt-bridge',
    description: 'Cross-network chat bridges (Matterbridge-style)',
    adapters: ['discord', 'irc', 'mastodon', 'matrix', 'nostr', 'signal', 'slack', 'telegram'],
  },
  {
    id: 'captcha',
    pkgPrefix: '@profullstack/sh1pt-captcha',
    description: 'CAPTCHA solvers — browser-mode fallback only',
    adapters: ['2captcha', 'captchasolver'],
  },
  {
    id: 'cloud',
    pkgPrefix: '@profullstack/sh1pt-cloud',
    description: 'Raw-compute cloud providers — VPS, GPU, rollouts',
    adapters: ['atlantic', 'cloudflare', 'digitalocean', 'hetzner', 'nvidia', 'railway', 'runpod', 'vultr'],
  },
  {
    id: 'dns',
    pkgPrefix: '@profullstack/sh1pt-dns',
    description: 'DNS providers — Porkbun, Cloudflare',
    adapters: ['cloudflare', 'porkbun'],
  },
  {
    id: 'docs',
    pkgPrefix: '@profullstack/sh1pt-docs',
    description: 'Pitch deck / doc generators — Marp, Google Slides, Pandoc, LuminPDF',
    adapters: ['gslides', 'lumin', 'marp', 'pandoc'],
  },
  {
    id: 'entity',
    pkgPrefix: '@profullstack/sh1pt-entity',
    description: 'Jurisdiction packs for incorporation + compliance',
    adapters: ['au', 'bb', 'bw', 'ca', 'dao-wy', 'fj', 'gh', 'hk', 'ie', 'in', 'jm', 'ke', 'my', 'ng', 'nz', 'pk', 'sg', 'tt', 'tz', 'ug', 'uk', 'us', 'za', 'zm', 'zw'],
  },
  {
    id: 'merch',
    pkgPrefix: '@profullstack/sh1pt-merch',
    description: 'Print-on-demand swag — Printful, Printify',
    adapters: ['printful', 'printify'],
  },
  {
    id: 'outreach',
    pkgPrefix: '@profullstack/sh1pt-outreach',
    description: 'Email + podcast + launch outreach',
    adapters: ['listennotes', 'producthunt', 'resend'],
  },
  {
    id: 'payments',
    pkgPrefix: '@profullstack/sh1pt-payment',
    description: 'Payment providers — CoinPay default, Stripe/PayPal/WorldRemit',
    adapters: ['coinpay', 'paypal', 'stripe', 'worldremit'],
  },
  {
    id: 'promo',
    pkgPrefix: '@profullstack/sh1pt-promo',
    description: 'Ad networks + fundraising rails',
    adapters: ['angellist', 'apple-search', 'capitalreach', 'google', 'kickstarter', 'linkedin', 'meta', 'microsoft', 'openvc', 'reddit', 'tiktok', 'wefunder', 'x', 'youtube'],
  },
  {
    id: 'recipes',
    pkgPrefix: '@profullstack/sh1pt-recipe',
    description: 'Composed app recipes',
    adapters: ['waitlist-crypto-investor'],
  },
  {
    id: 'social',
    pkgPrefix: '@profullstack/sh1pt-social',
    description: 'Organic social — X, LinkedIn, Bluesky, Mastodon, TikTok, Reddit…',
    adapters: ['4claw', 'blossom', 'bluesky', 'codenewbie', 'devto', 'facebook', 'forem', 'hackernews', 'hackernoon', 'hashnode', 'indiehackers', 'instagram', 'klawdin', 'linkedin', 'mastodon', 'medium', 'moltbook', 'moltexchange', 'moltfounders', 'moltywork', 'openwork', 'primal', 'quora', 'reddit', 'secureclaw', 'stackernews', 'the-colony', 'threads', 'tikclawk', 'tiktok', 'toku-agency', 'ugig', 'x', 'youtube'],
  },
  {
    id: 'targets',
    pkgPrefix: '@profullstack/sh1pt-target',
    description: 'Distribution targets — stores, registries, CDNs, deploy platforms',
    adapters: ['browser-chrome', 'chat-discord', 'chat-signal', 'chat-slack', 'chat-telegram', 'chat-whatsapp', 'console-steam', 'deploy-denodeploy', 'deploy-fly', 'deploy-railway', 'deploy-workers', 'desktop-linux', 'desktop-mac', 'desktop-steamos', 'desktop-win', 'mobile-ios', 'pkg-aube', 'pkg-cdn', 'pkg-deno', 'pkg-docker', 'pkg-fdroid', 'pkg-ghpackages', 'pkg-homebrew', 'pkg-jsr', 'pkg-npm', 'tv-androidtv', 'tv-firetv', 'tv-roku', 'tv-tvos', 'tv-webos', 'web-static', 'xr-meta-quest', 'xr-pico', 'xr-sidequest', 'xr-steamvr', 'xr-visionos', 'xr-webxr'],
  },
  {
    id: 'vcs',
    pkgPrefix: '@profullstack/sh1pt-vcs',
    description: 'VCS — GitHub, GitLab, Gitea',
    adapters: ['gitea', 'github', 'gitlab'],
  },
  {
    id: 'webhooks',
    pkgPrefix: '@profullstack/sh1pt-webhooks',
    description: 'Webhook targets — Discord, Slack, Teams, Telegram, generic HTTP',
    adapters: ['discord', 'generic', 'slack', 'teams', 'telegram'],
  },
];

export function categoryById(id: string): AdapterCategory | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

export function packageFor(category: AdapterCategory, adapterName: string): string {
  return `${category.pkgPrefix}-${adapterName}`;
}
