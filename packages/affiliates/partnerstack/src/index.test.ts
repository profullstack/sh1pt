import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = (secrets: Record<string, string> = { PARTNERSTACK_API_KEY: 'test-key' }) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

describe('PartnerStack affiliate adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a PartnerStack API key before making requests', async () => {
    await expect(adapter.connect(ctx({}), {})).rejects.toThrow('PARTNERSTACK_API_KEY not in vault');
  });

  it('probes partnerships and maps a default account id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        items: [{ partner_key: 'partner_123' }],
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(ctx(), {})).resolves.toEqual({ accountId: 'partner_123' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.partnerstack.com/api/v2/partnerships?limit=1');
    expect(request.headers.authorization).toBe('Bearer test-key');
  });

  it('fetches tracking links for an existing partnership', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: {
        items: [
          {
            url: 'https://partners.example/other',
            destination_url: 'https://other.example/pricing',
          },
          {
            tracking_url: 'https://partners.example/ref/acme',
            short_url: 'https://pst.ac/acme',
            destination_url: 'https://acme.example/pricing',
          },
        ],
      },
    })));

    await expect(adapter.getTrackingLink?.(
      ctx(),
      'part_123',
      'https://acme.example/pricing',
      {},
    )).resolves.toEqual({
      url: 'https://partners.example/ref/acme',
      shortUrl: 'https://pst.ac/acme',
    });
  });

  it('throws when PartnerStack returns no usable tracking URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { items: [{}] } })));

    await expect(adapter.getTrackingLink?.(
      ctx(),
      'part_123',
      'https://acme.example/pricing',
      {},
    )).rejects.toThrow('PartnerStack returned no tracking link');
  });

  it('aggregates read-side partnership stats from official list endpoints', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { items: [{ key: 'cus_1' }, { key: 'cus_2' }] } }))
      .mockResolvedValueOnce(jsonResponse({ data: { items: [{ key: 'lead_1' }] } }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          items: [
            { key: 'txn_1', partner_key: 'part_123', amount: 12500, currency: 'USD' },
            { key: 'txn_2', partner_key: 'other', amount: 99900, currency: 'USD' },
          ],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          items: [
            { key: 'rew_1', amount: 1200, clicks: 7, currency: 'USD', payment_status: 'available' },
            { key: 'rew_2', amount: '300', click_count: 2, currency: 'USD', payment_status: 'withdrawn' },
          ],
        },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.stats?.(ctx(), 'part_123', {})).resolves.toEqual({
      publishers: 1,
      clicks: 9,
      conversions: 4,
      revenue: 125,
      commissionsPaid: 3,
      currency: 'USD',
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.partnerstack.com/api/v2/customers?partner_key=part_123&limit=250',
      'https://api.partnerstack.com/api/v2/leads?partner_key=part_123&limit=250',
      'https://api.partnerstack.com/api/v2/transactions?limit=250',
      'https://api.partnerstack.com/api/v2/rewards?keywords=part_123&limit=250',
    ]);
  });

  it('includes provider status and body excerpt on API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid key'.repeat(40),
    }));

    await expect(adapter.connect(ctx(), {})).rejects.toThrow(/PartnerStack 401: invalid key/);
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  };
}
