import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = (secrets: Record<string, string> = { SOVRN_SECRET_KEY: 'sovrn-secret' }) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

describe('Sovrn Commerce affiliate adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a Sovrn Secret Key before making report requests', async () => {
    await expect(adapter.connect(ctx({}), {})).rejects.toThrow('SOVRN_SECRET_KEY not in vault');
  });

  it('loads campaigns during connect and maps the selected campaign id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      campaigns: [
        { campaignId: 9876543, apiKey: 'public-primary-key', name: 'PRIMARY' },
        { campaignId: 9876544, apiKey: 'public-blog-key', name: 'apparelblog.com' },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(ctx(), { accountId: 'apparelblog.com' })).resolves.toEqual({
      accountId: 'apparelblog.com',
    });
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://rest.viglink.com/api/account/campaigns/PRIMARY?format=json&rowsPerPage=100',
    );
    expect(request.headers.authorization).toBe('secret sovrn-secret');
    expect(request.headers.accept).toBe('application/json');
  });

  it('falls back to the first campaign id during connect', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      campaigns: [{ campaignId: 9876543, apiKey: 'public-primary-key', name: 'PRIMARY' }],
    })));

    await expect(adapter.connect(ctx(), {})).resolves.toEqual({ accountId: '9876543' });
  });

  it('builds a wrapped Sovrn affiliate link with CUID, UTM, bid floor, and fallback URL', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx(),
      '9876543',
      'https://retailer.example/product?id=123',
      {
        apiKey: 'public-api-key',
        bidFloor: '0.10',
        clickRef: 'example_click_123',
        fallbackUrl: 'https://fallback.example/product?id=123',
        utmCampaign: 'spring_sale',
        utmMedium: 'email',
        utmSource: 'newsletter',
      },
    )).resolves.toEqual({
      url: 'https://sovrn.co/?key=public-api-key&u=https%3A%2F%2Fretailer.example%2Fproduct%3Fid%3D123&cuid=example_click_123&utm_source=newsletter&utm_medium=email&utm_campaign=spring_sale&bf=0.10&fbu=https%3A%2F%2Ffallback.example%2Fproduct%3Fid%3D123',
    });
  });

  it('can read the Commerce API key from the vault for link wrapping', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx({ SOVRN_SECRET_KEY: 'sovrn-secret', SOVRN_COMMERCE_API_KEY: 'public-api-key' }),
      '9876543',
      'https://retailer.example/product',
      {},
    )).resolves.toEqual({
      url: 'https://sovrn.co/?key=public-api-key&u=https%3A%2F%2Fretailer.example%2Fproduct',
    });
  });

  it('requires a Commerce API key and an absolute destination URL for links', async () => {
    await expect(adapter.getTrackingLink?.(ctx(), '9876543', 'https://retailer.example', {}))
      .rejects.toThrow('Commerce API key is required');
    await expect(adapter.getTrackingLink?.(ctx(), '9876543', '/relative', { apiKey: 'public-api-key' }))
      .rejects.toThrow('must be an absolute URL');
  });

  it('rejects non-HTTP destination URLs', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx(),
      '9876543',
      'mailto:test@example.com',
      { apiKey: 'public-api-key' },
    )).rejects.toThrow('destinationUrl must use HTTP or HTTPS');
  });

  it('aggregates link report totals for stats', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [
        { linkUrl: 'https://retailer.example/a', revenue: 4.5, clicks: 9, sales: 1, actions: 1 },
      ],
      totals: {
        revenueTotal: 12.25,
        clicksTotal: 44,
        salesTotal: 3,
        actionsTotal: 5,
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.stats?.(ctx(), '9876543', {
      from: '2026-05-01',
      to: '2026-05-21',
      clickRef: 'example_click_123',
      merchantGroupIds: '78910',
      programType: 'CPA',
      country: 'US',
      currency: 'EUR',
    })).resolves.toEqual({
      publishers: 1,
      clicks: 44,
      conversions: 3,
      revenue: 12.25,
      commissionsPaid: 12.25,
      currency: 'EUR',
    });
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://viglink.io/v1/reports/links?clickDateStart=2026-05-01&clickDateEnd=2026-05-21&campaignIds=9876543&merchantGroupIds=78910&cuids=example_click_123&programType=CPA&country=US',
    );
    expect(request.headers.authorization).toBe('secret sovrn-secret');
  });

  it('falls back to summing report rows when totals are absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [
        { revenue: '2.50', clicks: '10', actions: 1 },
        { revenue: 3, clicks: 4, actions: 2 },
      ],
    })));

    await expect(adapter.stats?.(ctx(), '9876543', { from: '2026-05-01', to: '2026-05-21' }))
      .resolves.toMatchObject({
        clicks: 14,
        conversions: 3,
        revenue: 5.5,
        commissionsPaid: 5.5,
        currency: 'USD',
      });
  });

  it('redacts the secret key and Commerce API key from provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'secret sovrn-secret and key public-api-key rejected',
    }));

    await expect(adapter.stats?.(ctx(), '9876543', { apiKey: 'public-api-key' }))
      .rejects.toThrow('Sovrn 401: secret [redacted] and key [redacted] rejected');
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  };
}
