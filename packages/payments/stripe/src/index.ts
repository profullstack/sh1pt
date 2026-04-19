import { definePayment, type Webhook } from '@sh1pt/core';

// Stripe — cards + ACH + Link + local payment methods. Checkout API
// for one-time + subscriptions; Connect for marketplace payouts.
interface Config {
  accountId?: string;
  apiVersion?: string;
}

export default definePayment<Config>({
  id: 'payment-stripe',
  label: 'Stripe (cards / ACH / subscriptions / Connect)',
  supports: ['one-time', 'subscription'],
  async connect(ctx) {
    if (!ctx.secret('STRIPE_SECRET_KEY')) throw new Error('STRIPE_SECRET_KEY not in vault');
    return { accountId: 'stripe' };
  },
  async createCheckout(ctx, req) {
    ctx.log(`stripe checkout · ${req.amount} ${req.currency} · ${req.kind}`);
    // TODO: checkout.sessions.create with mode 'payment' or 'subscription';
    // for marketplaces set payment_intent_data.application_fee_amount
    // and transfer_data.destination = req.connectedAccountId.
    return {
      id: `cs_${Date.now()}`,
      url: 'https://checkout.stripe.com/c/pay/cs_stub',
    };
  },
  async verifyWebhook(ctx, rawBody): Promise<Webhook> {
    if (!ctx.secret('STRIPE_WEBHOOK_SECRET')) throw new Error('STRIPE_WEBHOOK_SECRET not in vault');
    // TODO: stripe.webhooks.constructEvent(rawBody, signature, secret)
    const payload = JSON.parse(rawBody);
    return { type: payload.type, payload };
  },
  async refund(paymentId) {
    return { id: `re_${Date.now()}` };
  },
  async payout(accountId, amount, currency) {
    // TODO: stripe.transfers.create({ amount, currency, destination: accountId })
    return { id: `tr_${Date.now()}` };
  },
});
