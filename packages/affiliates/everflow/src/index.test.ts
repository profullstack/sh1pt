import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = (secrets: Record<string, string> = { EVERFLOW_API_KEY: 'test-key' }) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

describe('Everflow affiliate adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires an Everflow API key before making requests', async () => {
    await expect(adapter.connect(ctx({}), {})).rejects.toThrow('EVERFLOW_API_KEY not in vault');
  });

  it('probes runnable offers during connect and maps a default account id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      offers: [{ network_offer_id: 123, currency_id: 'USD' }],
      paging: { total_count: 1 },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(ctx(), {})).resolves.toEqual({ accountId: '123' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.eflow.team/v1/affiliates/offersrunnable?page=1&page_size=1');
    expect(request.headers['X-Eflow-Api-Key']).toBe('test-key');
  });

  it('fetches a tracking URL for an offer and destination URL id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      url: 'https://trk.example/click?offer_id=123',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.getTrackingLink?.(
      ctx(),
      '123',
      'https://merchant.example/product',
      { urlId: 7 },
    )).resolves.toEqual({
      url: 'https://trk.example/click?offer_id=123&url=https%3A%2F%2Fmerchant.example%2Fproduct',
    });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'https://api.eflow.team/v1/affiliates/offers/123/url/7',
    );
  });

  it('falls back to the runnable offer tracking URL when url lookup omits one', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({
        offers: [{
          network_offer_id: 123,
          tracking_url: 'https://trk.example/base?offer_id=123',
        }],
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.getTrackingLink?.(
      ctx(),
      '123',
      'https://merchant.example/product',
      {},
    )).resolves.toEqual({
      url: 'https://trk.example/base?offer_id=123&url=https%3A%2F%2Fmerchant.example%2Fproduct',
    });
  });

  it('aggregates reporting and conversion stats for an offer', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        table: [{
          columns: [{ column_type: 'offer', id: '123', label: 'Acme' }],
          reporting: { total_click: 44, unique_click: 31, cv: 9, revenue: 12.5 },
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        conversions: [
          {
            conversion_id: 'cv_1',
            sale_amount: 100,
            revenue: 10,
            currency_id: 'USD',
            relationship: { offer: { network_offer_id: 123 } },
          },
          {
            conversion_id: 'cv_2',
            sale_amount: '50.25',
            revenue: '5.25',
            currency_id: 'USD',
            relationship: { offer: { network_offer_id: 123 } },
          },
          {
            conversion_id: 'other',
            sale_amount: 999,
            revenue: 99,
            currency_id: 'USD',
            relationship: { offer: { network_offer_id: 999 } },
          },
        ],
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.stats?.(ctx(), '123', {
      from: '2026-05-01',
      to: '2026-05-20',
      timezoneId: 67,
      currency: 'USD',
    })).resolves.toEqual({
      publishers: 1,
      clicks: 44,
      conversions: 2,
      revenue: 150.25,
      commissionsPaid: 15.25,
      currency: 'USD',
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.eflow.team/v1/affiliates/reporting/entity/table',
      'https://api.eflow.team/v1/affiliates/reporting/conversions',
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      from: '2026-05-01',
      to: '2026-05-20',
      timezone_id: 67,
      currency_id: 'USD',
      columns: [{ column: 'offer' }],
      query: { filters: [] },
    });
  });

  it('uses aggregate reporting when the conversion search has no rows', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        table: [{
          columns: [{ id: '123' }],
          reporting: { total_click: 4, cv: 3, revenue: 42 },
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({ conversions: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.stats?.(ctx(), '123', {})).resolves.toMatchObject({
      clicks: 4,
      conversions: 3,
      commissionsPaid: 42,
      currency: 'USD',
    });
  });

  it('includes provider status and body excerpt on API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid key'.repeat(40),
    }));

    await expect(adapter.connect(ctx(), {})).rejects.toThrow(/Everflow 401: invalid key/);
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  };
}
