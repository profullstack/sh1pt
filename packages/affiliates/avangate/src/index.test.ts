import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = {
  secret: vi.fn((key: string) => (key === 'AVANGATE_API_KEY' ? 'test-secret' : undefined)),
  log: vi.fn(),
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  ctx.secret.mockClear();
  ctx.log.mockClear();
});

describe('avangate adapter', () => {
  it('authenticates REST requests with the documented Avangate HMAC header', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-05-21T02:03:04Z'));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ Balance: 0 }));

    await adapter.connect(ctx, {
      accountId: 'MERCH123',
      apiBase: 'https://api.example.test/rest/6.0',
      currency: 'eur',
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://api.example.test/rest/6.0/payouts/pending/?Currency=EUR&TotalCurrency=EUR');
    const headers = (init as RequestInit).headers as Record<string, string>;
    const date = '2026-05-21 02:03:04';
    const hash = createHmac('sha256', 'test-secret').update(`8MERCH12319${date}`).digest('hex');
    expect(headers['X-Avangate-Authentication']).toBe(
      `code="MERCH123" date="${date}" hash="${hash}" algo="sha256"`,
    );
  });

  it('builds documented 2Checkout buy-links with product, source, currency, and affiliate tracking', async () => {
    const link = await adapter.getTrackingLink?.(ctx, '1234567', 'https://example.com/pricing', {
      accountId: 'MERCH123',
      affiliateId: '998877',
      currency: 'eur',
      source: 'Codex proof pass',
    });

    expect(link?.url).toBe(
      'https://secure.2checkout.com/order/checkout.php?PRODS=1234567&QTY=1&CURRENCY=EUR&SRC=Codex_proof_pass&AVGAFFILIATE=998877',
    );
  });

  it('summarizes partner order stats from Avangate order search rows', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      Items: [
        {
          Currency: 'EUR',
          Items: [{ ProductId: '1234567', Price: { Amount: '19.50' } }],
          AffiliateCode: 'aff-1',
          AffiliateCommission: '5.25',
        },
        {
          Currency: 'EUR',
          Items: [{ ProductId: '1234567', Price: { Amount: 10 } }],
          AffiliateCode: 'aff-2',
          CommissionAmount: 3,
        },
        {
          Currency: 'EUR',
          Items: [{ ProductId: '9999999', Price: { Amount: 99 } }],
          AffiliateCode: 'aff-3',
          AffiliateCommission: 50,
        },
      ],
    }));

    const stats = await adapter.stats?.(ctx, '1234567', {
      accountId: 'MERCH123',
      apiBase: 'https://api.example.test/rest/6.0',
      from: '2026-05-01',
      to: '2026-05-21',
    });

    expect(stats).toEqual({
      publishers: 2,
      clicks: 0,
      conversions: 2,
      revenue: 29.5,
      commissionsPaid: 8.25,
      currency: 'EUR',
    });
  });

  it('redacts merchant credentials from API error messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      'bad credentials for MERCH123 using test-secret',
      { status: 401 },
    ));

    await expect(adapter.connect(ctx, {
      accountId: 'MERCH123',
      apiBase: 'https://api.example.test/rest/6.0',
    })).rejects.toThrow('bad credentials for [redacted] using [redacted]');
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
