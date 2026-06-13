import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = (secrets: Record<string, string> = {
  RAKUTEN_AFFILIATE_ID: 'encrypted-id',
  RAKUTEN_API_TOKEN: 'rtok',
}) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

describe('Rakuten Advertising affiliate adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a Rakuten API token before making event requests', async () => {
    await expect(adapter.connect(ctx({ RAKUTEN_AFFILIATE_ID: 'encrypted-id' }), {}))
      .rejects.toThrow('RAKUTEN_API_TOKEN not in vault');
  });

  it('probes Events API during connect and preserves configured accountId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      transactions: [
        { advertiser_id: 123, sid: 'publisher-from-event' },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(ctx(), { accountId: 'configured-id', from: '2026-05-01' }))
      .resolves.toEqual({ accountId: 'configured-id' });
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://api.rakutenadvertising.com/events/1.0/transactions?limit=1&transaction_date_start=2026-05-01',
    );
    expect(request.headers.authorization).toBe('Bearer rtok');
    expect(request.headers.accept).toBe('application/json');
  });

  it('falls back to encrypted affiliate ID from the vault during connect', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ transactions: [] })));

    await expect(adapter.connect(ctx(), {})).resolves.toEqual({ accountId: 'encrypted-id' });
  });

  it('builds a Rakuten deep link with advertiser id, destination URL, and u1', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx(),
      '123',
      'https://merchant.example/product?id=10',
      { accountId: 'encrypted-id', u1: 'launch-1' },
    )).resolves.toEqual({
      url: 'https://click.linksynergy.com/deeplink?id=encrypted-id&mid=123&murl=https%3A%2F%2Fmerchant.example%2Fproduct%3Fid%3D10&u1=launch-1',
    });
  });

  it('requires an encrypted affiliate id and absolute destination URL for links', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx({ RAKUTEN_API_TOKEN: 'rtok' }),
      '123',
      'https://merchant.example/product',
      {},
    )).rejects.toThrow('encrypted affiliate ID is required');
    await expect(adapter.getTrackingLink?.(ctx(), '123', '/relative', {}))
      .rejects.toThrow('must be an absolute URL');
  });

  it('rejects non-HTTP destination URLs', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx(),
      '123',
      'data:text/html,not-a-product',
      {},
    )).rejects.toThrow('destinationUrl must use HTTP or HTTPS');
  });

  it('aggregates Events API rows for one advertiser', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      transactions: [
        {
          advertiser_id: 123,
          sale_amount: '99.95',
          commissions: '9.50',
          currency: 'USD',
        },
        {
          advertiser_id: 123,
          sale_amount: 40,
          commissions: 4,
          currency: 'USD',
        },
        {
          advertiser_id: 999,
          sale_amount: 999,
          commissions: 99,
        },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.stats?.(ctx(), '123', { from: '2026-05-01', u1: 'launch-1' }))
      .resolves.toEqual({
        publishers: 1,
        clicks: 0,
        conversions: 2,
        revenue: 139.95,
        commissionsPaid: 13.5,
        currency: 'USD',
      });
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://api.rakutenadvertising.com/events/1.0/transactions?advertiser_id=123&transaction_date_start=2026-05-01&u1=launch-1',
    );
  });

  it('counts unscoped event rows when provider omits advertiser id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      events: [
        { saleAmount: 10, commission: 1.5, currency: 'EUR' },
        { sales_amount: '20.00', commission: '3.00', currency: 'EUR' },
      ],
    })));

    await expect(adapter.stats?.(ctx(), '123', {})).resolves.toMatchObject({
      conversions: 2,
      revenue: 30,
      commissionsPaid: 4.5,
      currency: 'EUR',
    });
  });

  it('redacts API token and encrypted affiliate id from provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'token rtok for encrypted-id rejected',
    }));

    await expect(adapter.connect(ctx(), {}))
      .rejects.toThrow('Rakuten 401: token [redacted] for [redacted] rejected');
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  };
}
