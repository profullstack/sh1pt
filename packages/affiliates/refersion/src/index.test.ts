import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = (
  secrets: Record<string, string> = {
    REFERSION_PUBLIC_KEY: 'pub_test',
    REFERSION_SECRET_KEY: 'sec_test',
  },
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

describe('Refersion affiliate adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires Refersion public and secret keys before making requests', async () => {
    await expect(adapter.connect(ctx({}), {})).rejects.toThrow('REFERSION_PUBLIC_KEY not in vault or config');
    await expect(adapter.connect(ctx({ REFERSION_PUBLIC_KEY: 'pub_test' }), {})).rejects.toThrow(
      'REFERSION_SECRET_KEY not in vault',
    );
  });

  it('lists affiliates during connect and maps the first affiliate id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      total: 1,
      results: [{ id: '694c', offer_id: '1234', status: 'ACTIVE' }],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(ctx(), {})).resolves.toEqual({ accountId: '694c' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.refersion.com/v2/affiliate/list');
    expect(request.method).toBe('POST');
    expect(request.headers['Refersion-Public-Key']).toBe('pub_test');
    expect(request.headers['Refersion-Secret-Key']).toBe('sec_test');
    expect(JSON.parse(request.body)).toEqual({ limit: '1', page: '1' });
  });

  it('fetches a referral link by affiliate code', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      id: 37567438,
      offer_id: '1234',
      status: 'ACTIVE',
      link: 'https://site.refersion.com/c/a3y7',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.getTrackingLink?.(
      ctx(),
      '1234',
      'https://merchant.example/product',
      { affiliateId: 'a3y7' },
    )).resolves.toEqual({
      url: 'https://site.refersion.com/c/a3y7?u=https%3A%2F%2Fmerchant.example%2Fproduct',
    });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ affiliate_code: 'a3y7' });
  });

  it('throws when no Refersion referral link is available', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: 37567438 })));

    await expect(adapter.getTrackingLink?.(
      ctx(),
      '1234',
      'https://merchant.example/product',
      { affiliateId: 37567438 },
    )).rejects.toThrow('Refersion returned no referral link');
  });

  it('aggregates offer stats from affiliate list and conversion totals', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        results: [
          { id: '694c', offer_id: '1234', status: 'ACTIVE' },
          { id: '24fb', offer_id: '1234', status: 'PENDING' },
          { id: 'g23fz', offer_id: '9999', status: 'ACTIVE' },
          { id: 'deny', offer_id: '1234', status: 'DENIED' },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        conversions_count: '10',
        commission_total: '500.84',
        order_total: '3,498.03',
        commissionable_order_total: '2,874.85',
        currency: 'USD',
      }))
      .mockResolvedValueOnce(jsonResponse({
        conversions_count: '4',
        commission_total: '125.50',
        order_total: '900.00',
        currency: 'USD',
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.stats?.(ctx(), '1234', {
      affiliateId: 37567438,
      createdFrom: '2026-05-01 00:00:00',
      createdTo: '2026-05-20 23:59:59',
    })).resolves.toEqual({
      publishers: 2,
      clicks: 0,
      conversions: 10,
      revenue: 3498.03,
      commissionsPaid: 125.5,
      currency: 'USD',
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.refersion.com/v2/affiliate/list',
      'https://api.refersion.com/v2/conversion/totals',
      'https://api.refersion.com/v2/conversion/totals',
    ]);
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({
      created_from: '2026-05-01 00:00:00',
      created_to: '2026-05-20 23:59:59',
      offer_id: 1234,
      affiliate_id: 37567438,
      status: ['APPROVED', 'PENDING', 'UNQUALIFIED', 'DENIED'],
      is_test_conversion: false,
    });
    expect(JSON.parse(fetchMock.mock.calls[2]![1].body)).toMatchObject({
      offer_id: 1234,
      affiliate_id: 37567438,
      status: ['APPROVED'],
      payment_status: 'PAID',
    });
  });

  it('includes provider status and body excerpt on API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid keys'.repeat(40),
    }));

    await expect(adapter.connect(ctx(), {})).rejects.toThrow(/Refersion 401: invalid keys/);
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}
