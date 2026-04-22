import { definePayment, type Webhook } from '@profullstack/sh1pt-core';

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
});
