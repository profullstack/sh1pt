import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = (secrets: Record<string, string> = { AWIN_API_TOKEN: 'awin-token' }) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

describe('Awin affiliate adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires an Awin API token before making requests', async () => {
    await expect(adapter.connect(ctx({}), {})).rejects.toThrow('AWIN_API_TOKEN not in vault');
  });

  it('loads publisher accounts during connect and maps the first publisher id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      userId: 1,
      accounts: [
        { accountId: 1001, accountName: 'Advertiser', accountType: 'advertiser' },
        { accountId: 45628, accountName: 'Publisher', accountType: 'publisher' },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(ctx(), {})).resolves.toEqual({ accountId: '45628' });
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.awin.com/accounts?accessToken=awin-token&type=publisher');
    expect(request.headers.authorization).toBe('Bearer awin-token');
    expect(request.headers.accept).toBe('application/json');
  });

  it('preserves a configured publisher id during connect', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      accounts: [{ accountId: 45628, accountType: 'publisher' }],
    })));

    await expect(adapter.connect(ctx(), { accountId: 'configured' })).resolves.toEqual({
      accountId: 'configured',
    });
  });

  it('generates an Awin tracking link with clickref and short URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      url: 'https://www.awin1.com/cread.php?awinmid=123&awinaffid=45628',
      shortUrl: 'https://tidd.ly/example',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.getTrackingLink?.(
      ctx(),
      '123',
      'https://merchant.example/product',
      { accountId: '45628', clickRef: 'campaign_1', shorten: true },
    )).resolves.toEqual({
      url: 'https://www.awin1.com/cread.php?awinmid=123&awinaffid=45628',
      shortUrl: 'https://tidd.ly/example',
    });
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://api.awin.com/publishers/45628/linkbuilder/generate?accessToken=awin-token',
    );
    expect(JSON.parse(request.body)).toEqual({
      advertiserId: 123,
      destinationUrl: 'https://merchant.example/product',
      parameters: { clickref: 'campaign_1' },
      shorten: true,
    });
  });

  it('requires a publisher id for tracking links and stats', async () => {
    await expect(adapter.getTrackingLink?.(ctx(), '123', '', {})).rejects.toThrow(
      'Awin accountId is required',
    );
    await expect(adapter.stats?.(ctx(), '123', {})).rejects.toThrow('Awin accountId is required');
  });

  it('throws when link builder omits the generated URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ shortUrl: 'https://tidd.ly/example' })));

    await expect(adapter.getTrackingLink?.(ctx(), '123', '', { accountId: '45628' }))
      .rejects.toThrow('Awin returned no tracking URL');
  });

  it('aggregates advertiser performance and transaction fallback fields', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        body: [
          {
            advertiserId: 123,
            advertiserName: 'Merchant',
            currency: 'GBP',
            clicks: 44,
            totalNo: 4,
            totalValue: 250.5,
            totalComm: 25.75,
          },
          {
            advertiserId: 999,
            clicks: 999,
            totalNo: 999,
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse([
        {
          advertiserId: 123,
          commissionAmount: { amount: 5.5, currency: 'GBP' },
          saleAmount: { amount: 55, currency: 'GBP' },
        },
      ]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.stats?.(ctx(), '123', {
      accountId: '45628',
      from: '2026-05-01',
      to: '2026-05-20',
      region: 'GB',
      timezone: 'UTC',
    })).resolves.toEqual({
      publishers: 1,
      clicks: 44,
      conversions: 4,
      revenue: 250.5,
      commissionsPaid: 25.75,
      currency: 'GBP',
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.awin.com/publishers/45628/reports/advertiser?accessToken=awin-token&startDate=2026-05-01&endDate=2026-05-20&dateType=transaction&region=GB&timezone=UTC',
      'https://api.awin.com/publishers/45628/transactions/?accessToken=awin-token&startDate=2026-05-01T00%3A00%3A00&endDate=2026-05-20T23%3A59%3A59&timezone=UTC&dateType=transaction&advertiserId=123',
    ]);
  });

  it('falls back to matching transaction rows when report row is missing', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ body: [] }))
      .mockResolvedValueOnce(jsonResponse({
        transactions: [
          {
            advertiserId: 123,
            commissionAmount: { amount: '4.25', currency: 'EUR' },
            saleAmount: { amount: '40.00', currency: 'EUR' },
          },
          {
            advertiserId: 123,
            commissionAmount: { amount: 1.5, currency: 'EUR' },
            saleAmount: { amount: 10, currency: 'EUR' },
          },
          {
            advertiserId: 999,
            commissionAmount: { amount: 99, currency: 'EUR' },
            saleAmount: { amount: 999, currency: 'EUR' },
          },
        ],
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.stats?.(ctx(), '123', { accountId: '45628' })).resolves.toMatchObject({
      clicks: 0,
      conversions: 2,
      revenue: 50,
      commissionsPaid: 5.75,
      currency: 'EUR',
    });
  });

  it('includes provider status and body excerpt on API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid token'.repeat(40),
    }));

    await expect(adapter.connect(ctx(), {})).rejects.toThrow(/Awin 401: invalid token/);
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  };
}
