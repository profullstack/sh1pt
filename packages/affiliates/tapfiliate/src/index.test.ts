import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = (secrets: Record<string, string> = { TAPFILIATE_API_KEY: 'tap-key' }) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

function response(body: unknown, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Tapfiliate affiliate adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires an API key on connect', async () => {
    await expect(adapter.connect(ctx({}), {})).rejects.toThrow(/TAPFILIATE_API_KEY/);
  });

  it('resolves a configured Tapfiliate program', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
      id: 'johns-affiliate-program',
      title: "John's affiliate program",
      currency: 'USD',
      default_landing_page_url: 'https://example.com/product',
    }));

    const result = await adapter.createProgram!(ctx(), {
      name: "John's affiliate program",
      destinationUrl: 'https://example.com/product',
      commissionType: 'percentage',
      commissionRate: 20,
    }, { programId: 'johns-affiliate-program' });

    expect(result).toEqual({
      programId: 'johns-affiliate-program',
      marketplaceUrl: 'https://example.com/product',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://api.tapfiliate.com/1.6/programs/johns-affiliate-program/', {
      headers: {
        'content-type': 'application/json',
        'X-Api-Key': 'tap-key',
      },
    });
  });

  it('finds an existing program by landing page when no program id is configured', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response([
      {
        id: 'existing-program',
        title: 'Existing Program',
        currency: 'USD',
        default_landing_page_url: 'https://example.com/product',
      },
    ]));

    const result = await adapter.createProgram!(ctx(), {
      name: 'Different UI Name',
      destinationUrl: 'https://example.com/product',
      commissionType: 'flat',
      commissionRate: 5,
      currency: 'USD',
    }, {});

    expect(result.programId).toBe('existing-program');
  });

  it('returns a referral link for a configured affiliate', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
      id: 'janejameson',
      referral_link: {
        link: 'https://example.com/product?ref=nwjinmy',
        asset_id: '1-aaaaaa',
      },
    }));

    const link = await adapter.getTrackingLink!(
      ctx(),
      'johns-affiliate-program',
      'https://example.com/product',
      { affiliateId: 'janejameson' },
    );

    expect(link.url).toBe('https://example.com/product?ref=nwjinmy');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.tapfiliate.com/1.6/programs/johns-affiliate-program/affiliates/janejameson/',
    );
  });

  it('aggregates publishers, clicks, conversions, revenue, and paid commissions', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response({ id: 'program-1', currency: 'USD' }))
      .mockResolvedValueOnce(response([
        { id: 'approved', approved: true },
        { id: 'pending', approved: null },
        { id: 'rejected', approved: false },
      ]))
      .mockResolvedValueOnce(response([
        {
          amount: 100,
          program: { id: 'program-1', currency: 'USD' },
          commissions: [
            { amount: 10, payout: { id: 'pay-1' } },
            { amount: 5, payout: null },
          ],
        },
        { amount: 50, commissions: [{ amount: 8, payout: { id: 'pay-2' } }] },
      ]))
      .mockResolvedValueOnce(response([{ id: 'click-1' }, { id: 'click-2' }]));

    await expect(adapter.stats!(ctx(), 'program-1', {})).resolves.toEqual({
      publishers: 2,
      clicks: 2,
      conversions: 2,
      revenue: 150,
      commissionsPaid: 18,
      currency: 'USD',
    });
  });

  it('treats unavailable enterprise click stats as zero while keeping other stats', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response({ id: 'program-1', currency: 'EUR' }))
      .mockResolvedValueOnce(response([{ id: 'approved', approved: true }]))
      .mockResolvedValueOnce(response([{ amount: 25, commissions: [] }]))
      .mockResolvedValueOnce(response('enterprise only', 403));

    await expect(adapter.stats!(ctx(), 'program-1', {})).resolves.toMatchObject({
      clicks: 0,
      revenue: 25,
      currency: 'EUR',
    });
  });
});
