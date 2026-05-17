import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { smokeTest } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'payment', requireSupports: true });

describe('payment-stripe', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a real Stripe Checkout Session request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/c/pay/cs_test_123',
        expires_at: 1_700_000_000,
      }),
    } as Response);

    const session = await adapter.createCheckout(ctx({
      STRIPE_SECRET_KEY: 'sk_test_123',
    }), {
      amount: 2440,
      currency: 'USD',
      kind: 'one-time',
      successUrl: 'https://example.com/ok',
      cancelUrl: 'https://example.com/cancel',
      customerEmail: 'buyer@example.com',
      description: 'Launch plan',
      metadata: { order_id: 'ord_1' },
      platformFeeBps: 1500,
      connectedAccountId: 'acct_123',
    }, { apiVersion: '2024-06-20' });

    expect(session).toEqual({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      expiresAt: '2023-11-14T22:13:20.000Z',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk_test_123');
    expect((init.headers as Record<string, string>)['stripe-version']).toBe('2024-06-20');

    const body = init.body as URLSearchParams;
    expect(body.get('mode')).toBe('payment');
    expect(body.get('line_items[0][price_data][unit_amount]')).toBe('2440');
    expect(body.get('line_items[0][price_data][currency]')).toBe('usd');
    expect(body.get('line_items[0][price_data][product_data][name]')).toBe('Launch plan');
    expect(body.get('customer_email')).toBe('buyer@example.com');
    expect(body.get('metadata[order_id]')).toBe('ord_1');
    expect(body.get('payment_intent_data[application_fee_amount]')).toBe('366');
    expect(body.get('payment_intent_data[transfer_data][destination]')).toBe('acct_123');
  });

  it('verifies Stripe webhook signatures and normalizes checkout events', async () => {
    const raw = JSON.stringify({
      id: 'evt_123',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          status: 'complete',
          amount_total: 2440,
          currency: 'usd',
          customer_email: 'buyer@example.com',
        },
      },
    });
    const secret = 'whsec_test';
    const timestamp = '1700000000';
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${raw}`)
      .digest('hex');

    const webhook = await adapter.verifyWebhook(
      ctx({ STRIPE_WEBHOOK_SECRET: secret }),
      raw,
      `t=${timestamp},v1=${signature}`,
      {},
    );

    expect(webhook).toMatchObject({
      type: 'checkout.session.completed',
      paymentId: 'cs_test_123',
      status: 'succeeded',
      amount: 2440,
      currency: 'USD',
      customerEmail: 'buyer@example.com',
    });
  });

  it('rejects invalid Stripe webhook signatures', async () => {
    await expect(adapter.verifyWebhook(
      ctx({ STRIPE_WEBHOOK_SECRET: 'whsec_test' }),
      JSON.stringify({ type: 'checkout.session.completed' }),
      't=1700000000,v1=bad',
      {},
    )).rejects.toThrow('Invalid Stripe webhook signature');
  });
});

function ctx(secrets: Record<string, string>) {
  return {
    secret(key: string) {
      return secrets[key];
    },
    log: vi.fn(),
  };
}
