import { afterEach, describe, expect, it, vi } from 'vitest';
import { smokeTest } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'payment', requireSupports: true });

describe('payment-paypal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a PayPal order and returns the approval URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'access-token',
        token_type: 'Bearer',
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: '5O190127TN364715T',
        status: 'CREATED',
        links: [
          { rel: 'self', href: 'https://api-m.sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T' },
          { rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T' },
        ],
      }, 201));

    const session = await adapter.createCheckout(ctx({
      PAYPAL_CLIENT_ID: 'client-id',
      PAYPAL_CLIENT_SECRET: 'client-secret',
    }), {
      amount: 2440,
      currency: 'USD',
      kind: 'one-time',
      successUrl: 'https://example.com/ok',
      cancelUrl: 'https://example.com/cancel',
      description: 'Launch plan',
      customerEmail: 'buyer@example.com',
      metadata: {
        order_id: 'ord_1',
        invoice_id: 'inv_1',
      },
    }, { environment: 'sandbox', brandName: 'sh1pt' });

    expect(session).toEqual({
      id: '5O190127TN364715T',
      url: 'https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(tokenUrl).toBe('https://api-m.sandbox.paypal.com/v1/oauth2/token');
    expect(tokenInit.method).toBe('POST');
    expect((tokenInit.headers as Record<string, string>).authorization).toBe('Basic Y2xpZW50LWlkOmNsaWVudC1zZWNyZXQ=');
    expect((tokenInit.body as URLSearchParams).get('grant_type')).toBe('client_credentials');

    const [orderUrl, orderInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(orderUrl).toBe('https://api-m.sandbox.paypal.com/v2/checkout/orders');
    expect(orderInit.method).toBe('POST');
    expect((orderInit.headers as Record<string, string>).authorization).toBe('Bearer access-token');
    expect(JSON.parse(String(orderInit.body))).toEqual({
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: 'USD',
            value: '24.40',
          },
          description: 'Launch plan',
          custom_id: 'ord_1',
          invoice_id: 'inv_1',
        },
      ],
      application_context: {
        return_url: 'https://example.com/ok',
        cancel_url: 'https://example.com/cancel',
        brand_name: 'sh1pt',
        user_action: 'PAY_NOW',
        shipping_preference: 'NO_SHIPPING',
      },
    });
  });

  it('creates a PayPal subscription from a plan id', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-token' }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'I-BW452GLLEP1G',
        status: 'APPROVAL_PENDING',
        links: [
          { rel: 'approve', href: 'https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=BA-123' },
        ],
      }, 201));

    const session = await adapter.createCheckout(ctx({
      PAYPAL_CLIENT_ID: 'client-id',
      PAYPAL_CLIENT_SECRET: 'client-secret',
    }), {
      amount: 0,
      currency: 'USD',
      kind: 'subscription',
      priceId: 'P-123',
      successUrl: 'https://example.com/subscribed',
      cancelUrl: 'https://example.com/cancel',
      customerEmail: 'buyer@example.com',
      metadata: { orderId: 'sub_1' },
    }, { environment: 'sandbox' });

    expect(session).toEqual({
      id: 'I-BW452GLLEP1G',
      url: 'https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=BA-123',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [subscriptionUrl, subscriptionInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(subscriptionUrl).toBe('https://api-m.sandbox.paypal.com/v1/billing/subscriptions');
    expect(JSON.parse(String(subscriptionInit.body))).toEqual({
      plan_id: 'P-123',
      custom_id: 'sub_1',
      subscriber: {
        email_address: 'buyer@example.com',
      },
      application_context: {
        return_url: 'https://example.com/subscribed',
        cancel_url: 'https://example.com/cancel',
        user_action: 'SUBSCRIBE_NOW',
        shipping_preference: 'NO_SHIPPING',
      },
    });
  });

  it('verifies PayPal webhook signatures and normalizes capture events', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-token' }))
      .mockResolvedValueOnce(jsonResponse({ verification_status: 'SUCCESS' }));

    const raw = JSON.stringify({
      id: 'WH-123',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: 'CAPTURE-123',
        status: 'COMPLETED',
        amount: {
          value: '24.40',
          currency_code: 'USD',
        },
        payer: {
          email_address: 'buyer@example.com',
        },
      },
    });

    const webhook = await adapter.verifyWebhook(
      ctx({
        PAYPAL_CLIENT_ID: 'client-id',
        PAYPAL_CLIENT_SECRET: 'client-secret',
        PAYPAL_WEBHOOK_ID: 'WH-ID',
      }),
      raw,
      JSON.stringify({
        'paypal-auth-algo': 'SHA256withRSA',
        'paypal-cert-url': 'https://api-m.sandbox.paypal.com/certs/CERT-123',
        'paypal-transmission-id': 'abc-123',
        'paypal-transmission-sig': 'signature',
        'paypal-transmission-time': '2026-05-13T08:00:00Z',
      }),
      { environment: 'sandbox' },
    );

    expect(webhook).toMatchObject({
      type: 'PAYMENT.CAPTURE.COMPLETED',
      paymentId: 'CAPTURE-123',
      status: 'succeeded',
      amount: 2440,
      currency: 'USD',
      customerEmail: 'buyer@example.com',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [verifyUrl, verifyInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(verifyUrl).toBe('https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature');
    expect(JSON.parse(String(verifyInit.body))).toEqual({
      auth_algo: 'SHA256withRSA',
      cert_url: 'https://api-m.sandbox.paypal.com/certs/CERT-123',
      transmission_id: 'abc-123',
      transmission_sig: 'signature',
      transmission_time: '2026-05-13T08:00:00Z',
      webhook_id: 'WH-ID',
      webhook_event: JSON.parse(raw),
    });
  });

  it('surfaces PayPal API error details', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-token' }))
      .mockResolvedValueOnce(jsonResponse({
        name: 'UNPROCESSABLE_ENTITY',
        details: [{ issue: 'INVALID_REQUEST', description: 'Amount cannot be zero' }],
      }, 422));

    await expect(adapter.createCheckout(ctx({
      PAYPAL_CLIENT_ID: 'client-id',
      PAYPAL_CLIENT_SECRET: 'client-secret',
    }), {
      amount: 0,
      currency: 'USD',
      kind: 'one-time',
      successUrl: 'https://example.com/ok',
      cancelUrl: 'https://example.com/cancel',
    }, { environment: 'sandbox' })).rejects.toThrow('Amount cannot be zero');
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

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
    json: async () => body,
  } as Response;
}
