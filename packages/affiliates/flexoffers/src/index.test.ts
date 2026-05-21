import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = (secrets: Record<string, string> = { FLEXOFFERS_API_KEY: 'flex-token' }) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

describe('FlexOffers affiliate adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a FlexOffers API key before calling the API', async () => {
    await expect(adapter.connect(ctx({}), {})).rejects.toThrow('FLEXOFFERS_API_KEY not in vault');
  });

  it('loads approved advertisers during connect and preserves configured domain id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [
        {
          advertiserId: 127,
          domainID: 117,
          lastCommissionUpdated: '2026-05-01',
        },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(ctx(), { accountId: 'configured-domain' }))
      .resolves.toEqual({ accountId: 'configured-domain' });
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://api.flexoffers.com/advertisers?ApplicationStatus=approved&ProgamStatus=approved&SortColumn=lastCommissionUpdated&SortOrder=DESC&Page=1&pageSize=1',
    );
    expect(request.headers.authorization).toBe('Bearer flex-token');
    expect(request.headers.accept).toBe('application/json');
  });

  it('falls back to the advertiser domain id returned by the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      advertisers: [{ domainId: 117, advertiserId: 127 }],
    })));

    await expect(adapter.connect(ctx(), {})).resolves.toEqual({ accountId: '117' });
  });

  it('uses the FlexOffers deeplink API with sub-tracking ids by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      domainID: 117,
      adveriserID: 127,
      deeplink: 'https://track.flexlinkspro.com/a.ashx?foid=117.A127&foc=21&fot=9999&fos=1',
      originalUrl: 'https://www.macys.com/product',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.getTrackingLink?.(
      ctx(),
      '127',
      'https://www.macys.com/product?id=3702106',
      { fobs: 'SubID', fobs2: 'Email' },
    )).resolves.toEqual({
      url: 'https://track.flexlinkspro.com/a.ashx?foid=117.A127&foc=21&fot=9999&fos=1',
    });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'https://api.flexoffers.com/deeplink?AdvertiserId=127&URL=https%3A%2F%2Fwww.macys.com%2Fproduct%3Fid%3D3702106&fobs=SubID&fobs2=Email',
    );
  });

  it('builds the documented manual deep-link structure when API generation is disabled', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx({}),
      '171465',
      'https://www.bose.com/en_us/products/frames/bose-frames-alto.html',
      {
        accountId: '177',
        fobs: 'launch-1',
        useDeeplinkApi: false,
      },
    )).resolves.toEqual({
      url: 'https://track.flexlinkspro.com/a.ashx?foid=177.A171465&foc=1&fot=9999&fos=1&url=https%3A%2F%2Fwww.bose.com%2Fen_us%2Fproducts%2Fframes%2Fbose-frames-alto.html&fobs=launch-1',
    });
  });

  it('requires an absolute destination URL and domain id for manual links', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx({}),
      '171465',
      '/relative',
      { accountId: '177', useDeeplinkApi: false },
    )).rejects.toThrow('must be an absolute URL');
    await expect(adapter.getTrackingLink?.(
      ctx({}),
      '171465',
      'https://merchant.example/product',
      { useDeeplinkApi: false },
    )).rejects.toThrow('Domain ID is required');
  });

  it('loads sales stats across explicit statuses', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        sales: [
          { transactionId: 'A', amount: '100.50', commissionAmount: '12.25', currency: 'USD', clicks: 3 },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: [
          { transactionId: 'B', saleAmount: 50, publisherCommission: 8, currency: 'USD', clicks: 1 },
        ],
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.stats?.(ctx(), '127', {
      from: '2026-05-01',
      to: '2026-05-20',
      statuses: ['approved', 'pending'],
      adjustmentType: 'New Record',
    })).resolves.toEqual({
      publishers: 1,
      clicks: 4,
      conversions: 2,
      revenue: 150.5,
      commissionsPaid: 20.25,
      currency: 'USD',
    });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.flexoffers.com/allsales?AdvertiserId=127&reportType=details&Status=approved&FromDate=2026-05-01&ToDate=2026-05-20&Page=1&pageSize=100&adjustmentType=New+Record',
      'https://api.flexoffers.com/allsales?AdvertiserId=127&reportType=details&Status=pending&FromDate=2026-05-01&ToDate=2026-05-20&Page=1&pageSize=100&adjustmentType=New+Record',
    ]);
  });

  it('redacts the API key from provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'token flex-token rejected',
    }));

    await expect(adapter.connect(ctx(), {}))
      .rejects.toThrow('FlexOffers 401: token [redacted] rejected');
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  };
}
