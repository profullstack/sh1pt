import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = (secrets: Record<string, string> = { CLICKBANK_API_KEY: 'API-test-key' }) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

describe('ClickBank affiliate adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a ClickBank API key before calling the API', async () => {
    await expect(adapter.connect(ctx({}), {})).rejects.toThrow('CLICKBANK_API_KEY not in vault');
  });

  it('loads accessible nicknames during connect and maps a default account id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      accounts: [{ nickName: 'affiliate_one' }],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(ctx(), {})).resolves.toEqual({ accountId: 'affiliate_one' });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'https://api.clickbank.com/rest/1.3/quickstats/accounts',
    );
    expect(fetchMock.mock.calls[0]![1].headers.Authorization).toBe('API-test-key');
    expect(fetchMock.mock.calls[0]![1].headers.accept).toBe('application/json');
  });

  it('preserves a configured account id even when the API returns nicknames', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      accounts: [{ nickName: 'from_api' }],
    })));

    await expect(adapter.connect(ctx(), { accountId: 'configured' })).resolves.toEqual({
      accountId: 'configured',
    });
  });

  it('accepts ClickBank account nickname arrays during connect', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(['first_affiliate', 'second_affiliate'])));

    await expect(adapter.connect(ctx(), {})).resolves.toEqual({
      accountId: 'first_affiliate',
    });
  });

  it('builds an unencrypted HopLink with a sanitized tracking id', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx(),
      'vendorone',
      'https://vendor.example/product',
      { accountId: 'affone', trackingId: 'Blog-2026!' },
    )).resolves.toEqual({
      url: 'https://hop.clickbank.net/?affiliate=affone&vendor=vendorone&tid=blog_2026_',
    });
  });

  it('keeps an existing HopLink and adds a missing tracking id', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx(),
      'vendorone',
      'https://encryptedvalue.hop.clickbank.net/path',
      { accountId: 'affone', trackingId: 'email_1' },
    )).resolves.toEqual({
      url: 'https://encryptedvalue.hop.clickbank.net/path?tid=email_1',
    });
  });

  it('does not overwrite an existing HopLink tracking id', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx(),
      'vendorone',
      'https://hop.clickbank.net/?affiliate=affone&vendor=vendorone&tid=kept',
      { accountId: 'affone', trackingId: 'new_tid' },
    )).resolves.toEqual({
      url: 'https://hop.clickbank.net/?affiliate=affone&vendor=vendorone&tid=kept',
    });
  });

  it('requires account id to build links and stats', async () => {
    await expect(adapter.getTrackingLink?.(ctx(), 'vendorone', '', {})).rejects.toThrow(
      'ClickBank accountId is required',
    );
    await expect(adapter.stats?.(ctx(), 'vendorone', {})).rejects.toThrow(
      'ClickBank accountId is required',
    );
  });

  it('loads affiliate order count and order list stats for a vendor', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ count: '2' }))
      .mockResolvedValueOnce(jsonResponse({
        orders: [
          { receipt: 'A', totalOrderAmount: '100.50', affiliateCommission: '42.25', currency: 'USD' },
          { receipt: 'B', transactionAmount: 50, commission: 20, currency: 'USD' },
        ],
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.stats?.(ctx(), 'vendorone', {
      accountId: 'affone',
      from: '2026-05-01',
      to: '2026-05-20',
      trackingId: 'blog_2026',
    })).resolves.toEqual({
      publishers: 1,
      clicks: 0,
      conversions: 2,
      revenue: 150.5,
      commissionsPaid: 62.25,
      currency: 'USD',
    });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.clickbank.com/rest/1.3/orders2/count?role=AFFILIATE&type=SALE&affiliate=affone&vendor=vendorone&startDate=2026-05-01&endDate=2026-05-20&tid=blog_2026',
      'https://api.clickbank.com/rest/1.3/orders2/list?role=AFFILIATE&type=SALE&affiliate=affone&vendor=vendorone&startDate=2026-05-01&endDate=2026-05-20&tid=blog_2026',
    ]);
    expect(fetchMock.mock.calls[1]![1].headers.Page).toBe('1');
  });

  it('falls back to listed order count and revenue as commission when needed', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({
        orderData: [
          { receipt: 'A', amount: '12.00', currencyCode: 'EUR' },
          { receipt: 'B', amount: '8.50', currencyCode: 'EUR' },
        ],
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.stats?.(ctx(), 'vendorone', { accountId: 'affone', page: 3 }))
      .resolves.toEqual({
        publishers: 1,
        clicks: 0,
        conversions: 2,
        revenue: 20.5,
        commissionsPaid: 20.5,
        currency: 'EUR',
      });
    expect(fetchMock.mock.calls[1]![1].headers.Page).toBe('3');
  });

  it('includes provider status and body excerpt on API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'quota exceeded'.repeat(40),
    }));

    await expect(adapter.connect(ctx(), {})).rejects.toThrow(/ClickBank 403: quota exceeded/);
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  };
}
