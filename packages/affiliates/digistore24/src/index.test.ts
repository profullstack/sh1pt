import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = (secrets: Record<string, string> = { DIGISTORE24_API_KEY: 'ds24-key' }) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

function response(body: unknown, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Digistore24 affiliate adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires an API key on connect', async () => {
    await expect(adapter.connect(ctx({}), {})).rejects.toThrow(/DIGISTORE24_API_KEY/);
  });

  it('resolves a configured Digistore24 product', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
      product: {
        id: 4242,
        name: 'Launch Kit',
        url: 'https://example.com/launch-kit',
      },
    }));

    const result = await adapter.createProgram!(ctx(), {
      name: 'Launch Kit',
      destinationUrl: 'https://example.com/launch-kit',
      commissionType: 'percentage',
      commissionRate: 40,
    }, { productId: '4242' });

    expect(result).toEqual({
      programId: '4242',
      marketplaceUrl: 'https://example.com/launch-kit',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://www.digistore24.com/api/call/getProduct?product_id=4242'),
      {
        method: 'GET',
        headers: {
          'content-type': 'application/json',
          'X-DS-API-KEY': 'ds24-key',
        },
      },
    );
  });

  it('finds an existing product by name when no product id is configured', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response([
      { id: 11, name: 'Other Product' },
      { id: 22, name: 'Existing Program', marketplace_url: 'https://digistore24.com/product/22' },
    ]));

    const result = await adapter.createProgram!(ctx(), {
      name: 'Existing Program',
      destinationUrl: 'https://example.com/existing',
      commissionType: 'flat',
      commissionRate: 10,
      currency: 'USD',
    }, {});

    expect(result).toEqual({
      programId: '22',
      marketplaceUrl: 'https://digistore24.com/product/22',
    });
  });

  it('creates a tracked Digistore24 buy URL for an affiliate', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
      url: 'https://www.digistore24.com/product/4242?ds24tr=abc',
    }));

    const link = await adapter.getTrackingLink!(
      ctx(),
      '4242',
      'https://example.com/launch-kit',
      {
        affiliate: 'jane-affiliate',
        campaignKey: 'launch',
        trackingKey: 'newsletter',
      },
    );

    expect(link.url).toBe('https://www.digistore24.com/product/4242?ds24tr=abc');
    const url = fetchMock.mock.calls[0]?.[0] as URL;
    expect(url.pathname).toBe('/api/call/createBuyUrl');
    expect(url.searchParams.get('product_id')).toBe('4242');
    expect(JSON.parse(url.searchParams.get('tracking') ?? '{}')).toEqual({
      affiliate: 'jane-affiliate',
      campaignkey: 'launch',
      trackingkey: 'newsletter',
    });
    expect(JSON.parse(url.searchParams.get('urls') ?? '{}')).toEqual({
      fallback_url: 'https://example.com/launch-kit',
    });
  });

  it('aggregates affiliate stats from Digistore24 statistics and transaction endpoints', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response({
        data: {
          top_list: [
            { affiliate_id: 1, affiliate_name: 'Alice', currency: 'EUR', affiliate_amount: 12, payment_amount: 100 },
            { affiliate_id: 2, affiliate_name: 'Bob', currency: 'EUR', affiliate_amount: 8, payment_amount: 50 },
          ],
        },
      }))
      .mockResolvedValueOnce(response({
        totals: {
          funnelVisitors: 75,
          orderFormVisitors: 30,
          earnings: 150,
        },
      }))
      .mockResolvedValueOnce(response({
        data: {
          summary: {
            amounts: {
              EUR: {
                count: 3,
                total_amount: 150,
                earned_amount: 20,
              },
            },
          },
          transaction_list: [
            { amount: 100, currency: 'EUR', transaction_type: 'payment' },
            { amount: 50, currency: 'EUR', transaction_type: 'payment' },
          ],
        },
      }));

    await expect(adapter.stats!(ctx(), '4242', {
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-05-20T23:59:59.000Z',
      fromMonth: '2026-05',
      toMonth: '2026-05',
      currency: 'EUR',
    })).resolves.toEqual({
      publishers: 2,
      clicks: 75,
      conversions: 3,
      revenue: 150,
      commissionsPaid: 20,
      currency: 'EUR',
    });
  });
});
