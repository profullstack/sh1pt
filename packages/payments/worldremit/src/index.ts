import { definePayment, manualSetup, type Webhook } from '@profullstack/sh1pt-core';

// WorldRemit — cross-border payouts / remittance. Not a typical checkout
// provider (you don't take customer money through them); use this for
// SENDING money to contractors, creators, or marketplace sellers in
// ~130 countries. connect() auth and payout() are the primary methods.
interface Config {
  environment?: 'sandbox' | 'live';
}

export default definePayment<Config>({
  id: 'payment-worldremit',
  label: 'WorldRemit (cross-border payouts)',
  supports: [],                     // not a checkout provider
  async connect(ctx) {
    if (!ctx.secret('WORLDREMIT_API_KEY')) throw new Error('WORLDREMIT_API_KEY not in vault');
    return { accountId: 'worldremit' };
  },
  async createCheckout() {
    throw new Error('payment-worldremit does not support buyer-facing checkout — use payout() instead');
  },
  async verifyWebhook(_ctx, rawBody): Promise<Webhook> {
    return { type: 'unknown', payload: JSON.parse(rawBody) };
  },
  async payout(accountId, amount, currency) {
    // TODO: quote → create transfer → pay via saved funding source
    return { id: `wr_${Date.now()}` };
  },

  setup: manualSetup({
    label: 'WorldRemit',
    vendorDocUrl: 'https://www.worldremit.com/en/business',
    steps: [
      'WorldRemit has no self-serve public API — contact their Business team to get credentials',
      'Once approved, they supply an API key + signing secret',
      'Run: sh1pt secret set WORLDREMIT_API_KEY <key>',
      'Run: sh1pt secret set WORLDREMIT_API_SECRET <secret>',
    ],
  }),
});
