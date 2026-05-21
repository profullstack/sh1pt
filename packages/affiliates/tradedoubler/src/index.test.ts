import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = (secrets: Record<string, string> = { TRADEDOUBLER_API_TOKEN: 'td-token' }) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

describe('Tradedoubler affiliate adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a Products API token before making requests', async () => {
    await expect(adapter.connect(ctx({}), {})).rejects.toThrow('TRADEDOUBLER_API_TOKEN not in vault');
  });

  it('probes product feeds during connect and preserves configured publisher id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      feeds: [
        {
          feedId: 19750,
          currencyISOCode: 'GBP',
          programs: [{ programId: 41305, name: 'Merchant UK' }],
        },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(ctx(), { accountId: '2038177' })).resolves.toEqual({
      accountId: '2038177',
    });
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.tradedoubler.com/1.0/productFeeds.json?token=td-token');
    expect(request.headers.accept).toBe('application/json');
  });

  it('can read publisher id from the vault when config omits accountId', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ feeds: [] })));

    await expect(adapter.connect(ctx({
      TRADEDOUBLER_API_TOKEN: 'td-token',
      TRADEDOUBLER_PUBLISHER_ID: '2038177',
    }), {})).resolves.toEqual({
      accountId: '2038177',
    });
  });

  it('builds a direct Tradedoubler tracking URL with EPI values', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx(),
      '41305',
      'https://merchant.example/path?q=coffee grinder',
      {
        accountId: '2038177',
        adId: '2468',
        clickRef: 'launch-1',
        clickRef2: 'newsletter',
      },
    )).resolves.toEqual({
      url: 'https://clk.tradedoubler.com/click?a(2038177)p(41305)g(2468)epi(launch-1)epi2(newsletter)url(https%3A%2F%2Fmerchant.example%2Fpath%3Fq%3Dcoffee%20grinder)',
    });
  });

  it('requires publisher id and an absolute destination URL for tracking links', async () => {
    await expect(adapter.getTrackingLink?.(ctx(), '41305', 'https://merchant.example', {}))
      .rejects.toThrow('publisher id is required');
    await expect(adapter.getTrackingLink?.(ctx(), '41305', '/relative', { accountId: '2038177' }))
      .rejects.toThrow('must be an absolute URL');
  });

  it('uses matrix syntax to scope product-feed stats by program', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      feeds: [
        {
          feedId: 19750,
          currencyISOCode: 'GBP',
          programs: [{ programId: 41305, name: 'Merchant UK' }],
        },
        {
          feedId: 20782,
          currencyISOCode: 'EUR',
          programs: [{ programId: 99999, name: 'Other Merchant' }],
        },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.stats?.(ctx(), '41305', {})).resolves.toEqual({
      publishers: 1,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      commissionsPaid: 0,
      currency: 'GBP',
    });
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://api.tradedoubler.com/1.0/productFeeds.json;programId=41305?token=td-token',
    );
  });

  it('falls back to configured currency when no matching feeds are returned', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ feeds: [] })));

    await expect(adapter.stats?.(ctx(), '41305', { currency: 'SEK' })).resolves.toEqual({
      publishers: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      commissionsPaid: 0,
      currency: 'SEK',
    });
  });

  it('redacts the API token from provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'token td-token is invalid',
    }));

    await expect(adapter.connect(ctx(), {})).rejects.toThrow('Tradedoubler 401: token [redacted] is invalid');
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  };
}
