import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = (secrets: Record<string, string> = { TAPFILIATE_API_KEY: 'test-key' }) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

describe('Tapfiliate affiliate adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a Tapfiliate API key before making requests', async () => {
    await expect(adapter.connect(ctx({}), {})).rejects.toThrow('TAPFILIATE_API_KEY not in vault');
  });

  it('lists programs during connect and maps the first program id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([
      {
        id: 'johns-affiliate-program',
        currency: 'USD',
      },
    ]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(ctx(), {})).resolves.toEqual({ accountId: 'johns-affiliate-program' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.tapfiliate.com/1.6/programs/');
    expect(request.headers['X-Api-Key']).toBe('test-key');
  });

  it('fetches a referral link for a configured affiliate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      id: 'janejameson',
      referral_link: {
        link: 'https://tapper.inc/product/?ref=nwjinmy',
        short_url: 'https://tapf.li/nwjinmy',
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.getTrackingLink?.(
      ctx(),
      'johns-affiliate-program',
      'https://tapper.inc/product/',
      { affiliateId: 'janejameson' },
    )).resolves.toEqual({
      url: 'https://tapper.inc/product/?ref=nwjinmy',
      shortUrl: 'https://tapf.li/nwjinmy',
    });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'https://api.tapfiliate.com/1.6/programs/johns-affiliate-program/affiliates/janejameson/',
    );
  });

  it('selects a listed affiliate referral link that matches the destination', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([
      {
        id: 'other',
        referral_link: { link: 'https://other.example/?ref=abc' },
      },
      {
        id: 'janejameson',
        referral_link: { link: 'https://tapper.inc/product/?ref=nwjinmy' },
      },
    ])));

    await expect(adapter.getTrackingLink?.(
      ctx(),
      'johns-affiliate-program',
      'https://tapper.inc/product/',
      {},
    )).resolves.toEqual({
      url: 'https://tapper.inc/product/?ref=nwjinmy',
      shortUrl: undefined,
    });
  });

  it('throws when no Tapfiliate referral link is available', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([{ id: 'janejameson' }])));

    await expect(adapter.getTrackingLink?.(
      ctx(),
      'johns-affiliate-program',
      'https://tapper.inc/product/',
      {},
    )).rejects.toThrow('Tapfiliate returned no referral link');
  });

  it('aggregates program stats from conversions, commissions, payments, and clicks', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'johns-affiliate-program', currency: 'USD' }))
      .mockResolvedValueOnce(jsonResponse([
        { id: 'jane', approved: true },
        { id: 'pending', approved: null },
        { id: 'blocked', approved: false },
      ]))
      .mockResolvedValueOnce(jsonResponse([
        {
          id: 1,
          amount: 550,
          program: { id: 'johns-affiliate-program', currency: 'USD' },
          commissions: [
            { amount: 55, currency: 'USD', payout: { id: 'po_1' } },
            { amount: 10, currency: 'USD', payout: null },
          ],
        },
        {
          id: 2,
          amount: '20',
          program: { id: 'johns-affiliate-program', currency: 'USD' },
          commissions: [{ amount: 2, currency: 'USD', paid: true }],
        },
      ]))
      .mockResolvedValueOnce(jsonResponse([
        { amount: 8, currency: 'USD', program_id: 'johns-affiliate-program', payment_status: 'paid' },
        { amount: 99, currency: 'USD', program_id: 'other', payment_status: 'paid' },
      ]))
      .mockResolvedValueOnce(jsonResponse([
        { id: 'pa_1', amount: 55, currency: 'USD', affiliate: { id: 'jane' } },
      ]))
      .mockResolvedValueOnce(jsonResponse([
        { id: 'click_1' },
        { id: 'click_2' },
      ]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.stats?.(ctx(), 'johns-affiliate-program', {
      affiliateId: 'jane',
      dateFrom: '2026-05-01',
      dateTo: '2026-05-20',
    })).resolves.toEqual({
      publishers: 2,
      clicks: 2,
      conversions: 2,
      revenue: 570,
      commissionsPaid: 65,
      currency: 'USD',
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.tapfiliate.com/1.6/programs/johns-affiliate-program/',
      'https://api.tapfiliate.com/1.6/programs/johns-affiliate-program/affiliates/',
      'https://api.tapfiliate.com/1.6/conversions/?program_id=johns-affiliate-program&affiliate_id=jane&date_from=2026-05-01&date_to=2026-05-20',
      'https://api.tapfiliate.com/1.6/commissions/?affiliate_id=jane',
      'https://api.tapfiliate.com/1.6/payments/',
      'https://api.tapfiliate.com/1.6/clicks/?program_id=johns-affiliate-program&affiliate_id=jane&date_from=2026-05-01&date_to=2026-05-20',
    ]);
  });

  it('treats unavailable Enterprise click reporting as zero clicks', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'johns-affiliate-program', currency: 'USD' }))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'clicks require Enterprise',
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.stats?.(ctx(), 'johns-affiliate-program', {})).resolves.toMatchObject({
      clicks: 0,
      conversions: 0,
      commissionsPaid: 0,
    });
  });

  it('includes provider status and body excerpt on API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid key'.repeat(40),
    }));

    await expect(adapter.connect(ctx(), {})).rejects.toThrow(/Tapfiliate 401: invalid key/);
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  };
}
