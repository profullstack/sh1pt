import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { smokeTest } from '@profullstack/sh1pt-core/testing';
import payment from './index.js';

smokeTest(payment, { idPrefix: 'payment', requireSupports: true });

describe('payment-coinpay', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a CoinPayPortal payment request and returns its checkout URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        coins: [
          { symbol: 'BTC', is_active: true, has_wallet: true },
          { symbol: 'USDC_SOL', is_active: true, has_wallet: true },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        payment: {
          id: 'pay_123',
          checkout_url: 'https://coinpayportal.com/pay/pay_123',
          expires_at: '2026-05-13T08:00:00.000Z',
        },
      }));

    const session = await payment.createCheckout(ctx({ COINPAY_API_KEY: 'cp_live_test' }), {
      amount: 2440,
      currency: 'USD',
      kind: 'one-time',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      customerEmail: 'buyer@example.com',
      description: 'Launch plan',
      metadata: { order_id: 'ord_1' },
    }, {
      businessId: 'biz_123',
      acceptedCoins: ['USDC'],
      currency: 'usdc_sol',
      apiBaseUrl: 'https://coinpayportal.test/api',
    });

    expect(session).toEqual({
      id: 'pay_123',
      url: 'https://coinpayportal.com/pay/pay_123',
      expiresAt: '2026-05-13T08:00:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [supportedUrl, supportedInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(supportedUrl.origin + supportedUrl.pathname).toBe('https://coinpayportal.test/api/supported-coins');
    expect(supportedUrl.searchParams.get('business_id')).toBe('biz_123');
    expect(supportedUrl.searchParams.get('active_only')).toBe('true');
    expect(supportedInit.method).toBe('GET');

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://coinpayportal.test/api/payments/create');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer cp_live_test');

    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      business_id: 'biz_123',
      amount_usd: '24.40',
      currency: 'usdc_sol',
      payment_method: 'crypto',
      redirect_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      description: 'Launch plan',
      metadata: {
        order_id: 'ord_1',
        customer_email: 'buyer@example.com',
        payment_rail: 'crypto',
      },
    });
  });

  it('uses the business supported coins endpoint when no currency is configured', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        coins: [
          { symbol: 'SOL', is_active: true, has_wallet: true },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        payment: {
          id: 'pay_sol',
          checkout_url: 'https://coinpayportal.com/pay/pay_sol',
        },
      }));

    await payment.createCheckout(ctx({ COINPAY_API_KEY: 'cp_live_test' }), {
      amount: 500,
      currency: 'USD',
      kind: 'one-time',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    }, {
      businessId: 'biz_123',
      apiBaseUrl: 'https://coinpayportal.test/api',
    });

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      currency: 'sol',
    });
  });

  it('rejects configured currencies that are not enabled for the business', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({
      success: true,
      coins: [
        { symbol: 'SOL', is_active: true, has_wallet: true },
      ],
    }));

    await expect(payment.createCheckout(ctx({ COINPAY_API_KEY: 'cp_live_test' }), {
      amount: 500,
      currency: 'USD',
      kind: 'one-time',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    }, {
      businessId: 'biz_123',
      currency: 'usdc_sol',
      apiBaseUrl: 'https://coinpayportal.test/api',
    })).rejects.toThrow('does not support configured currency usdc_sol');
  });

  it('verifies CoinPay webhook signatures and normalizes payment events', async () => {
    const raw = JSON.stringify({
      id: 'evt_pay_123',
      type: 'payment.confirmed',
      data: {
        payment_id: 'pay_123',
        status: 'confirmed',
        amount_usd: '24.40',
        currency: 'USDC',
        metadata: { customer_email: 'buyer@example.com' },
      },
    });
    const secret = 'whsec_test';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${raw}`)
      .digest('hex');

    const webhook = await payment.verifyWebhook(
      ctx({ COINPAY_WEBHOOK_SECRET: secret }),
      raw,
      `t=${timestamp},v1=${signature}`,
      {},
    );

    expect(webhook).toMatchObject({
      type: 'payment.confirmed',
      paymentId: 'pay_123',
      status: 'succeeded',
      amount: 2440,
      currency: 'USDC',
      customerEmail: 'buyer@example.com',
    });
  });

  it('rejects invalid CoinPay webhook signatures', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    await expect(payment.verifyWebhook(
      ctx({ COINPAY_WEBHOOK_SECRET: 'whsec_test' }),
      JSON.stringify({ type: 'payment.confirmed' }),
      `t=${timestamp},v1=bad`,
      {},
    )).rejects.toThrow('Invalid CoinPay webhook signature');
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

function jsonResponse(json: unknown): Response {
  return {
    ok: true,
    json: async () => json,
  } as Response;
}
