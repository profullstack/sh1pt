import { describe, expect, it, vi, afterEach } from 'vitest';
import { smokeTest } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = {
  secret: (key: string) => (key === 'ADMITAD_ACCESS_TOKEN' ? 'admitad-token' : undefined),
  log: vi.fn(),
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('admitad affiliate adapter', () => {
  it('discovers the first active publisher ad space', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([
      { id: 22, status: 'suspended', name: 'old site' },
      { id: 23, status: 'active', name: 'main site' },
    ])));

    await expect(adapter.connect(ctx, {})).resolves.toEqual({ accountId: '23' });
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://api.admitad.com/websites/v2/'),
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer admitad-token' }),
      }),
    );
  });

  it('reuses a configured website id without an API probe', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(ctx, { websiteId: '777' })).resolves.toEqual({ accountId: '777' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('generates deeplinks with destination URL and SubID tracking', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([
      { link: 'https://ad.admitad.com/goto/hash/?subid=launch' },
    ])));

    await expect(adapter.getTrackingLink?.(
      ctx,
      '234433',
      'https://example.com/product',
      { websiteId: '232236', subid: 'launch' },
    )).resolves.toEqual({ url: 'https://ad.admitad.com/goto/hash/?subid=launch' });

    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as URL;
    expect(url.toString()).toBe(
      'https://api.admitad.com/deeplink/232236/advcampaign/234433/?ulp=https%3A%2F%2Fexample.com%2Fproduct&subid=launch',
    );
  });

  it('rejects non-HTTP destination URLs before calling Admitad', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.getTrackingLink?.(
      ctx,
      '234433',
      'javascript:alert(1)',
      { websiteId: '232236' },
    )).rejects.toThrow('Admitad destinationUrl must use HTTP or HTTPS');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aggregates publisher website and action statistics', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        results: [{
          clicks: 42,
          currency: 'EUR',
          leads_sum: 2,
          payment_sum_approved: '7.50',
          payment_sum_open: 1.25,
          sales_sum: 3,
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        results: [
          { payment: 5, paid: 1, currency: 'EUR' },
          { payment: 4, paid: 0, currency: 'EUR' },
        ],
      })));

    await expect(adapter.stats?.(ctx, '77', {
      from: '2026-05-01',
      to: '2026-05-20',
      websiteId: '12',
    })).resolves.toEqual({
      publishers: 1,
      clicks: 42,
      conversions: 5,
      revenue: 8.75,
      commissionsPaid: 5,
      currency: 'EUR',
    });

    const firstUrl = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as URL;
    expect(firstUrl.pathname).toBe('/statistics/websites/');
    expect(firstUrl.searchParams.get('date_start')).toBe('01.05.2026');
    expect(firstUrl.searchParams.get('date_end')).toBe('20.05.2026');
    expect(firstUrl.searchParams.get('campaign')).toBe('77');
    expect(firstUrl.searchParams.get('website')).toBe('12');
    expect(firstUrl.searchParams.get('total')).toBe('1');
  });

  it('surfaces Admitad API errors with response status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid token',
    }));

    await expect(adapter.stats?.(ctx, '77', {})).rejects.toThrow('Admitad 401: invalid token');
  });
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}
