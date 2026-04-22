import { tokenSetup } from '@profullstack/sh1pt-core';
// Product Hunt launch prep + post. Public API allows reading products
// but launch submissions go through the web UI (browser-mode needed).
// ⚠ PH has strict anti-gaming — do not buy upvotes, do not coordinate
// voting in private groups. Account bans are permanent.
interface Config {
  mode: 'browser';
  productSlug?: string;
  tagline?: string;
  galleryImages?: string[];    // paths or URLs
  topics?: string[];           // PH topic slugs
  makers?: string[];           // usernames to credit
  firstComment?: string;       // the maker's introductory comment
  scheduleFor?: Date;          // PST launch time
  captchaSolver?: 'captcha-2captcha' | 'captcha-solver';
}

export default {
  id: 'outreach-producthunt',
  label: 'Product Hunt (launch)',

  async connect(ctx: { secret(k: string): string | undefined; log(m: string): void }) {
    if (!ctx.secret('PRODUCTHUNT_EMAIL') || !ctx.secret('PRODUCTHUNT_PASSWORD')) {
      throw new Error('PRODUCTHUNT_EMAIL + PRODUCTHUNT_PASSWORD required in vault (browser mode)');
    }
    return { accountId: 'producthunt' };
  },

  async launch(ctx: { log(m: string): void; dryRun: boolean }, config: Config) {
    ctx.log(`producthunt launch · ${config.productSlug ?? '(new)'} · scheduled=${config.scheduleFor?.toISOString() ?? 'now'}`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://www.producthunt.com/' };
    // TODO: Playwright flow — login, create submission, upload gallery,
    // pick topics, attach makers, seed first comment, pick PST launch slot.
    // Honor PH rules: no upvote solicitation in private channels.
    return { id: `ph_${Date.now()}`, url: `https://www.producthunt.com/posts/${config.productSlug ?? ''}` };
  },

  setup: tokenSetup({
    secretKey: "PRODUCTHUNT_API_TOKEN",
    label: "Product Hunt",
    vendorDocUrl: "https://api.producthunt.com/v2/oauth/applications",
    steps: [
      "Open api.producthunt.com/v2/oauth/applications \u2192 Add an application",
      "Mint a developer token with the public scope",
      "\u26a0 Launch day submissions still require browser-mode + manual actions",
      "\u26a0 NEVER solicit upvotes in private channels \u2014 permanent account bans",
    ],
  }),
};
