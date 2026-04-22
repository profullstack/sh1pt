import { definePayment, type Webhook } from '@profullstack/sh1pt-core';

interface Config {
  clientId?: string;
  environment?: 'sandbox' | 'live';
}

export default definePayment<Config>({
  id: 'payment-paypal',
  label: 'PayPal',
  supports: ['one-time', 'subscription'],
  async connect(ctx) {
    if (!ctx.secret('PAYPAL_CLIENT_ID') || !ctx.secret('PAYPAL_CLIENT_SECRET')) {
      throw new Error('PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET required in vault');
    }
    return { accountId: 'paypal' };
  },
  async createCheckout(ctx, req) {
    ctx.log(`paypal order · ${req.amount} ${req.currency}`);
    return { id: `pp_${Date.now()}`, url: 'https://www.paypal.com/checkoutnow?token=stub' };
  },
  async verifyWebhook(ctx, rawBody): Promise<Webhook> {
    // TODO: /v1/notifications/verify-webhook-signature
    return { type: 'unknown', payload: JSON.parse(rawBody) };
  },
});
