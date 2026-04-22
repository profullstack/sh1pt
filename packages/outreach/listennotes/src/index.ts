import { tokenSetup } from '@profullstack/sh1pt-core';
// Listen Notes — the biggest podcast database with a real API. Use
// this for DISCOVERY (find relevant shows by niche, audience size,
// guest history); send the actual pitch via outreach-cold-email.
interface Config {
  apiKey?: string;             // paid tiers; free tier works for basic search
  niche?: string[];
  minListeners?: number;
  language?: string;           // ISO code
}

const API = 'https://listen-api.listennotes.com/api/v2';

export default {
  id: 'outreach-listennotes',
  label: 'Listen Notes (podcast discovery)',

  async connect(ctx: { secret(k: string): string | undefined; log(m: string): void }) {
    if (!ctx.secret('LISTENNOTES_API_KEY')) {
      ctx.log('LISTENNOTES_API_KEY not in vault — falling back to free-tier endpoints', 'warn');
    }
    return { accountId: 'listennotes' };
  },

  async search(ctx: { log(m: string): void }, config: Config) {
    ctx.log(`listennotes search · niche=${config.niche?.join(',') ?? 'any'} · min listeners=${config.minListeners ?? 0}`);
    // TODO: GET ${API}/typeahead → ${API}/search?q=<niche> filtered by language/minListeners
    // Return results with host contact emails where available (listed_in_* fields).
    return { podcasts: [] };
  },

  setup: tokenSetup({
    secretKey: "LISTENNOTES_API_KEY",
    label: "Listen Notes (podcast discovery)",
    vendorDocUrl: "https://www.listennotes.com/api/",
    steps: [
      "Open listennotes.com/api \u2192 Sign up for a plan (free tier has limits)",
      "Copy your API key",
    ],
  }),
};
