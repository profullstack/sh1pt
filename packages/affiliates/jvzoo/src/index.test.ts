import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = (secrets: Record<string, string> = { JVZOO_API_KEY: 'jvzoo-key' }) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

describe('JVZoo affiliate adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a JVZoo API key before calling the API', async () => {
    await expect(adapter.connect(ctx({}), {})).rejects.toThrow('JVZOO_API_KEY not in vault');
  });

  it('probes affiliate transactions during connect with Basic Auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      meta: { results_count: 1 },
      results: [
        {
          transaction_id: 'AP-123',
          affiliate_id: '3522',
        },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(ctx(), {})).resolves.toEqual({ accountId: '3522' });
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.jvzoo.com/v2.0/latest-affiliates-transactions');
    expect(request.headers.authorization).toBe(`Basic ${Buffer.from('jvzoo-key:x').toString('base64')}`);
    expect(request.headers.accept).toBe('application/json');
  });

  it('preserves configured account id while still verifying API access', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ results: [] })));

    await expect(adapter.connect(ctx(), { accountId: 'configured-affiliate' }))
      .resolves.toEqual({ accountId: 'configured-affiliate' });
  });

  it('builds a JVZoo affiliate link with a sanitized tracking id', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx(),
      '3665',
      'https://seller.example/product',
      { accountId: '3522', trackingId: 'Launch-2026_Email!' },
    )).resolves.toEqual({
      url: 'https://www.jvzoo.com/c/3522/3665/?tid=launch2026email',
    });
  });

  it('keeps an approved JVZoo affiliate link and appends a missing TID', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx(),
      '3665',
      'https://www.jvzoo.com/c/3522/3665/',
      { trackingId: 'email1' },
    )).resolves.toEqual({
      url: 'https://www.jvzoo.com/c/3522/3665/?tid=email1',
    });
  });

  it('does not overwrite an existing JVZoo tracking id', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx(),
      '3665',
      'https://www.jvzoo.com/c/3522/3665/?tid=kept',
      { trackingId: 'newtid' },
    )).resolves.toEqual({
      url: 'https://www.jvzoo.com/c/3522/3665/?tid=kept',
    });
  });

  it('requires an affiliate id when no approved affiliate link is configured', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx(),
      '3665',
      'https://seller.example/product',
      {},
    )).rejects.toThrow('affiliate ID is required');
  });

  it('loads affiliate transaction stats for one product', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      results: [
        {
          transaction_id: 'AP-1',
          product_id: '3665',
          amount: '49.00',
          commission: '24.50',
          currency: 'USD',
        },
        {
          transaction_id: 'AP-2',
          cproditem: '3665',
          ctransamount: 20,
          affiliate_commission: 10,
          currency: 'USD',
        },
        {
          transaction_id: 'AP-3',
          product_id: '9999',
          amount: 999,
          commission: 999,
        },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.stats?.(ctx(), '3665', { paykey: 'AP-0' })).resolves.toEqual({
      publishers: 1,
      clicks: 0,
      conversions: 2,
      revenue: 69,
      commissionsPaid: 34.5,
      currency: 'USD',
    });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'https://api.jvzoo.com/v2.0/latest-affiliates-transactions/AP-0',
    );
  });

  it('can include vendor transactions when requested', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ results: [{ transaction_id: 'AP-1', productId: '3665', amount: 30, payout: 12 }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ transaction_id: 'VP-1', product: '3665', sale_amount: 40, commission: 0 }] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.stats?.(ctx(), '3665', { includeVendorTransactions: true }))
      .resolves.toMatchObject({
        conversions: 2,
        revenue: 70,
        commissionsPaid: 12,
      });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.jvzoo.com/v2.0/latest-affiliates-transactions',
      'https://api.jvzoo.com/v2.0/latest-transactions',
    ]);
  });

  it('redacts API key material from provider errors', async () => {
    const basic = Buffer.from('jvzoo-key:x').toString('base64');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => `api key jvzoo-key basic ${basic} rejected`,
    }));

    await expect(adapter.connect(ctx(), {}))
      .rejects.toThrow('JVZoo 401: api key [redacted] basic [redacted] rejected');
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  };
}
