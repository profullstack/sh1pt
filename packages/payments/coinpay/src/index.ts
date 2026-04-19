import { definePayment, type CheckoutSession, type Webhook } from '@sh1pt/core';

// CoinPay — default crypto-accepting payment provider in sh1pt. Accepts
// BTC / ETH / USDC / SOL, settles to the merchant wallet or fiat on ramp.
// Webhook signature is HMAC-SHA256 of raw body using the webhook secret.
interface Config {
  merchantId?: string;
  acceptedCoins?: string[];          // e.g. ['BTC','ETH','USDC','SOL']
  settlementMode?: 'crypto' | 'fiat'; // keep as crypto, or auto-convert
  webhookSecret?: string;            // read from vault if not set here
}

const API = 'https://api.coinpay.com/v1';

export default definePayment<Config>({
  id: 'payment-coinpay',
  label: 'CoinPay (crypto — default)',
  supports: ['crypto', 'one-time', 'subscription', 'crowdfund'],

  async connect(ctx, config) {
    if (!ctx.secret('COINPAY_API_KEY')) throw new Error('COINPAY_API_KEY not in vault');
    ctx.log(`coinpay connected · coins=${config.acceptedCoins?.join(',') ?? 'BTC,ETH,USDC,SOL'}`);
    return { accountId: config.merchantId ?? 'coinpay' };
  },

  async createCheckout(ctx, req) {
    ctx.log(`coinpay checkout · ${req.amount} ${req.currency} · ${req.kind}`);
    // TODO: POST ${API}/checkouts with { amount, currency, accepted_coins,
    // success_url, cancel_url, metadata, settlement_mode }
    return {
      id: `cp_${Date.now()}`,
      url: `https://pay.coinpay.com/checkout/stub?amount=${req.amount}&currency=${req.currency}`,
    } satisfies CheckoutSession;
  },

  async verifyWebhook(_ctx, rawBody, signature): Promise<Webhook> {
    // TODO: HMAC-SHA256(rawBody, COINPAY_WEBHOOK_SECRET) === signature
    const payload = JSON.parse(rawBody);
    return {
      type: payload.type ?? 'unknown',
      payload,
      paymentId: payload.id,
      status: payload.status,
      amount: payload.amount,
      currency: payload.currency,
      customerEmail: payload.customer_email,
    };
  },
});
