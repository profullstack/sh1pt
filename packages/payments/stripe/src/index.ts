import { createHmac, timingSafeEqual } from 'node:crypto';
import { definePayment, tokenSetup, type CheckoutRequest, type Webhook } from '@profullstack/sh1pt-core';

// Stripe — cards + ACH + Link + local payment methods. Checkout API
// for one-time + subscriptions; Connect for marketplace payouts.
interface Config {
  accountId?: string;
  apiVersion?: string;
}

const STRIPE_API = 'https://api.stripe.com/v1';

export default definePayment<Config>({
  id: 'payment-stripe',
  label: 'Stripe (cards / ACH / subscriptions / Connect)',
  supports: ['one-time', 'subscription'],

  async connect(ctx, config) {
    const secret = ctx.secret('STRIPE_SECRET_KEY');
    if (!secret) throw new Error('STRIPE_SECRET_KEY not in vault');
    return { accountId: config.accountId ?? 'stripe' };
  },

  async createCheckout(ctx, req, config) {
    const secret = ctx.secret('STRIPE_SECRET_KEY');
    if (!secret) throw new Error('STRIPE_SECRET_KEY not in vault');

    ctx.log(`stripe checkout · ${req.amount} ${req.currency} · ${req.kind}`);
    const res = await stripeRequest(secret, '/checkout/sessions', buildCheckoutBody(req), config);
    const session = await readStripeJson<StripeCheckoutSession>(res);

    if (!session.id || !session.url) {
      throw new Error('Stripe checkout response did not include id and url');
    }

    return {
      id: session.id,
      url: session.url,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : undefined,
    };
  },

  async verifyWebhook(ctx, rawBody, signature): Promise<Webhook> {
    const secret = ctx.secret('STRIPE_WEBHOOK_SECRET');
    if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET not in vault');
    verifyStripeSignature(rawBody, signature, secret);

    const payload = JSON.parse(rawBody) as StripeEvent;
    const object = payload.data?.object ?? {};
    return {
      type: payload.type ?? 'unknown',
      payload,
      paymentId: typeof object.id === 'string' ? object.id : payload.id,
      status: normalizeStripeStatus(object.status),
      amount: typeof object.amount_total === 'number' ? object.amount_total : object.amount,
      currency: typeof object.currency === 'string' ? object.currency.toUpperCase() : undefined,
      customerEmail: object.customer_email ?? object.receipt_email,
    };
  },

  async refund(paymentId, amount) {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) throw new Error('STRIPE_SECRET_KEY not in environment');
    const body: Record<string, string> = { payment_intent: paymentId };
    if (amount !== undefined) body.amount = String(amount);
    const res = await stripeRequest(secret, '/refunds', body);
    const refund = await readStripeJson<{ id?: string }>(res);
    if (!refund.id) throw new Error('Stripe refund response did not include id');
    return { id: refund.id };
  },

  async payout(accountId, amount, currency) {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) throw new Error('STRIPE_SECRET_KEY not in environment');
    const res = await stripeRequest(secret, '/transfers', {
      amount: String(amount),
      currency: currency.toLowerCase(),
      destination: accountId,
    });
    const transfer = await readStripeJson<{ id?: string }>(res);
    if (!transfer.id) throw new Error('Stripe transfer response did not include id');
    return { id: transfer.id };
  },

  setup: tokenSetup<Config>({
    secretKey: 'STRIPE_SECRET_KEY',
    label: 'Stripe',
    vendorDocUrl: 'https://dashboard.stripe.com/apikeys',
    steps: [
      'Install stripe CLI from the official docs',
      'Authenticate locally: stripe login',
      'Open dashboard.stripe.com -> Developers -> API keys',
      'Copy the "Secret key" (sk_live_... or sk_test_... for test mode)',
      'Webhook endpoint: set up https://dashboard.stripe.com/webhooks for your sh1pt cloud callback, copy the signing secret',
    ],
    fields: [
      { key: 'STRIPE_WEBHOOK_SECRET', message: 'Paste the Stripe webhook signing secret (whsec_...):', secret: true },
    ],
  }),
});

function buildCheckoutBody(req: CheckoutRequest): Record<string, string> {
  const mode = req.kind === 'subscription' ? 'subscription' : 'payment';
  const body: Record<string, string> = {
    mode,
    success_url: req.successUrl,
    cancel_url: req.cancelUrl,
    'line_items[0][quantity]': '1',
  };

  if (req.customerId) body.customer = req.customerId;
  if (req.customerEmail && !req.customerId) body.customer_email = req.customerEmail;

  if (req.priceId) {
    body['line_items[0][price]'] = req.priceId;
  } else {
    body['line_items[0][price_data][currency]'] = req.currency.toLowerCase();
    body['line_items[0][price_data][unit_amount]'] = String(req.amount);
    body['line_items[0][price_data][product_data][name]'] = req.description ?? 'sh1pt checkout';
  }

  for (const [key, value] of Object.entries(req.metadata ?? {})) {
    body[`metadata[${key}]`] = value;
  }

  if (mode === 'payment' && req.platformFeeBps && req.connectedAccountId) {
    body['payment_intent_data[application_fee_amount]'] = String(
      Math.round((req.amount * req.platformFeeBps) / 10_000),
    );
    body['payment_intent_data[transfer_data][destination]'] = req.connectedAccountId;
  }

  return body;
}

async function stripeRequest(
  secret: string,
  path: string,
  body: Record<string, string>,
  config: Config = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${secret}`,
    'content-type': 'application/x-www-form-urlencoded',
  };
  if (config.apiVersion) headers['stripe-version'] = config.apiVersion;

  return fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers,
    body: new URLSearchParams(body),
  });
}

async function readStripeJson<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!res.ok) {
    const message = json.error?.message ?? `Stripe API error ${res.status}`;
    throw new Error(message);
  }
  return json;
}

function verifyStripeSignature(rawBody: string, header: string, secret: string): void {
  // Parse all key=value pairs preserving duplicate v1 keys.
  // Stripe sends multiple v1 signatures during webhook secret rotation;
  // Object.fromEntries() would silently drop all but one.
  let timestamp: string | undefined;
  const v1Signatures: string[] = [];

  for (const part of header.split(',')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (key === 't') {
      timestamp = val;
    } else if (key === 'v1' && val) {
      v1Signatures.push(val);
    }
  }

  if (!timestamp || v1Signatures.length === 0) {
    throw new Error('Stripe-Signature missing t or v1');
  }

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  // Accept the webhook if ANY provided v1 signature matches.
  const valid = v1Signatures.some((sig) => {
    try {
      const actualBuffer = Buffer.from(sig, 'hex');
      return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
    } catch {
      return false;
    }
  });

  if (!valid) {
    throw new Error('Invalid Stripe webhook signature');
  }
}

function normalizeStripeStatus(status: unknown): Webhook['status'] | undefined {
  if (status === 'paid' || status === 'complete' || status === 'succeeded') return 'succeeded';
  if (status === 'open' || status === 'processing' || status === 'requires_payment_method') return 'pending';
  if (status === 'expired' || status === 'canceled' || status === 'failed') return 'failed';
  return undefined;
}

interface StripeCheckoutSession {
  id?: string;
  url?: string;
  expires_at?: number;
}

interface StripeEvent {
  id?: string;
  type?: string;
  data?: {
    object?: {
      id?: string;
      status?: string;
      amount?: number;
      amount_total?: number;
      currency?: string;
      customer_email?: string;
      receipt_email?: string;
    };
  };
}
