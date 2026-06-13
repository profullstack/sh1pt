import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = (secrets: Record<string, string> = {
  SHAREASALE_AFFILIATE_ID: '555111',
  SHAREASALE_API_TOKEN: 'sas-token',
}) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

describe('ShareASale affiliate adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a ShareASale API token before making requests', async () => {
    await expect(adapter.connect(ctx({ SHAREASALE_AFFILIATE_ID: '555111' }), {}))
      .rejects.toThrow('SHAREASALE_API_TOKEN not in vault');
  });

  it('requires an Affiliate ID for API calls and links', async () => {
    await expect(adapter.connect(ctx({ SHAREASALE_API_TOKEN: 'sas-token' }), {}))
      .rejects.toThrow('Affiliate ID is required');
    await expect(adapter.getTrackingLink?.(
      ctx({ SHAREASALE_API_TOKEN: 'sas-token' }),
      '47',
      'https://merchant.example/product',
      {},
    )).rejects.toThrow('Affiliate ID is required');
  });

  it('probes daily activity during connect with configured accountId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse('merchantId|hits|sales|commissions\n47|2|1|3.50'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(ctx(), { accountId: '777222' })).resolves.toEqual({
      accountId: '777222',
    });
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://shareasale.com/x.cfm?affiliateId=777222&action=dailyActivity&sortcol=hits&sortdir=desc&XMLFormat=0&token=sas-token&version=1.7',
    );
    expect(request.headers.accept).toBe('application/json, text/plain, */*');
  });

  it('builds a ShareASale custom tracking link with afftrack and banner id', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx(),
      '47',
      'https://merchant.example/product?id=123',
      { bannerId: '1001', afftrack: 'launch-1' },
    )).resolves.toEqual({
      url: 'https://www.shareasale.com/r.cfm?b=1001&u=555111&m=47&urllink=https%3A%2F%2Fmerchant.example%2Fproduct%3Fid%3D123&afftrack=launch-1',
    });
  });

  it('requires an absolute destination URL for links', async () => {
    await expect(adapter.getTrackingLink?.(ctx(), '47', '/relative', {}))
      .rejects.toThrow('must be an absolute URL');
  });

  it('rejects non-HTTP destination URLs', async () => {
    await expect(adapter.getTrackingLink?.(ctx(), '47', 'javascript:alert(1)', {}))
      .rejects.toThrow('destinationUrl must use HTTP or HTTPS');
  });

  it('aggregates JSON daily activity stats for one merchant', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [
        {
          merchantId: 47,
          clicks: 12,
          sales: 2,
          grossSales: '140.25',
          commissions: '14.50',
          currency: 'USD',
        },
        {
          merchantId: 999,
          clicks: 99,
          sales: 99,
        },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.stats?.(ctx(), '47', { accountId: '777222', currency: 'EUR' }))
      .resolves.toEqual({
        publishers: 1,
        clicks: 12,
        conversions: 2,
        revenue: 140.25,
        commissionsPaid: 14.5,
        currency: 'EUR',
      });
  });

  it('parses delimited daily activity output when JSON is not returned', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(textResponse([
      'Merchant ID|Hits|Sales|Gross Sales|Commissions|Currency',
      '47|10|1|$99.95|$9.50|USD',
      '47|5|2|50.00|5.00|USD',
    ].join('\n'))));

    await expect(adapter.stats?.(ctx(), '47', {})).resolves.toEqual({
      publishers: 1,
      clicks: 15,
      conversions: 3,
      revenue: 149.95,
      commissionsPaid: 14.5,
      currency: 'USD',
    });
  });

  it('falls back to all rows when no merchant row matches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [
        { merchantId: 100, hits: 3, sales: 1, commissions: 2 },
        { merchantId: 200, hits: 4, sales: 0, commissions: 0 },
      ],
    })));

    await expect(adapter.stats?.(ctx(), '47', {})).resolves.toMatchObject({
      publishers: 1,
      clicks: 7,
      conversions: 1,
      commissionsPaid: 2,
    });
  });

  it('redacts the API token from provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'token sas-token is not authorized',
      headers: new Headers({ 'content-type': 'text/plain' }),
    }));

    await expect(adapter.connect(ctx(), {}))
      .rejects.toThrow('ShareASale 401: token [redacted] is not authorized');
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    text: async () => JSON.stringify(body),
    headers: new Headers({ 'content-type': 'application/json' }),
  };
}

function textResponse(body: string) {
  return {
    ok: true,
    text: async () => body,
    headers: new Headers({ 'content-type': 'text/plain' }),
  };
}
