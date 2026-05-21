import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = (secrets: Record<string, string> = { SKIMLINKS_CLIENT_SECRET: 'skim-secret' }) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

describe('Skimlinks affiliate adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires client credentials or a direct token before connecting', async () => {
    await expect(adapter.connect(ctx({}), {})).rejects.toThrow(
      'SKIMLINKS_CLIENT_ID/clientId and SKIMLINKS_CLIENT_SECRET are required',
    );
  });

  it('verifies credentials through the official authentication API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonTextResponse({
      access_token: '12345:1553009669:abc123abc123abc123',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(ctx(), { clientId: 'skim-client', publisherId: '145349' })).resolves.toEqual({
      accountId: '145349',
    });

    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://authentication.skimapis.com/access_token');
    expect(request.method).toBe('POST');
    expect(JSON.parse(request.body)).toEqual({
      client_id: 'skim-client',
      client_secret: 'skim-secret',
      grant_type: 'client_credentials',
    });
  });

  it('builds Link Wrapper URLs with sref and custom tracking', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx({ SKIMLINKS_ACCESS_TOKEN: 'direct-token' }),
      '6143',
      'https://merchant.example/product?a=1',
      { domainId: '123X456', sref: 'https://publisher.example/post', customId: 'campaign-1' },
    )).resolves.toEqual({
      url: 'https://go.skimresources.com/?id=123X456&url=https%3A%2F%2Fmerchant.example%2Fproduct%3Fa%3D1&sref=https%3A%2F%2Fpublisher.example%2Fpost&xcust=campaign-1',
    });
  });

  it('requires a domain id and destination URL for Link Wrapper URLs', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx({ SKIMLINKS_ACCESS_TOKEN: 'direct-token' }),
      '6143',
      'https://merchant.example/product',
      {},
    )).rejects.toThrow('Skimlinks domainId is required');
    await expect(adapter.getTrackingLink?.(
      ctx({ SKIMLINKS_ACCESS_TOKEN: 'direct-token' }),
      '6143',
      '',
      { domainId: '123X456' },
    )).rejects.toThrow('Skimlinks destinationUrl is required');
  });

  it('aggregates Reporting API merchant stats using authenticated access tokens', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonTextResponse({ access_token: '12345:1553009669:abc123abc123abc123' }))
      .mockResolvedValueOnce(jsonTextResponse({
        count: 1,
        reports: [{
          clicks_affiliated: 5,
          order_amount: 70,
          publisher_commission_amount: 7,
          sales: 2,
        }],
        totals: {
          clicks_affiliated: 11,
          order_amount: 100,
          publisher_commission_amount: 9.5,
          sales: 3,
        },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.stats?.(ctx(), '6143', {
      clientId: 'skim-client',
      currency: 'EUR',
      from: '2026-05-01',
      publisherDomainId: '22',
      publisherId: '145349',
      to: '2026-05-20',
    })).resolves.toEqual({
      publishers: 1,
      clicks: 11,
      conversions: 3,
      revenue: 100,
      commissionsPaid: 9.5,
      currency: 'EUR',
    });

    const [url] = fetchMock.mock.calls[1]!;
    expect(String(url)).toBe(
      'https://reporting.skimapis.com/publisher/145349/reports?access_token=12345%3A1553009669%3Aabc123abc123abc123&report_by=merchant&start_date=2026-05-01&end_date=2026-05-20&sort_by=publisher_commission_amount&sort_dir=DESC&currency=EUR&a_id=6143&domain_id=22',
    );
  });

  it('falls back to summing report rows when totals are omitted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonTextResponse({
      reports: [
        { clicks_affiliated: 2, sales: 1, order_amount: '10.50', publisher_commission_amount: '1.25' },
        { clicks_affiliated: 3, sales: 2, order_amount: 20, publisher_commission_amount: 2 },
      ],
    })));

    await expect(adapter.stats?.(
      ctx({ SKIMLINKS_ACCESS_TOKEN: 'direct-token' }),
      '6143',
      { publisherId: '145349' },
    )).resolves.toEqual({
      publishers: 1,
      clicks: 5,
      conversions: 3,
      revenue: 30.5,
      commissionsPaid: 3.25,
      currency: 'USD',
    });
  });

  it('requires a publisher id for Reporting API stats', async () => {
    await expect(adapter.stats?.(
      ctx({ SKIMLINKS_ACCESS_TOKEN: 'direct-token' }),
      '6143',
      {},
    )).rejects.toThrow('Skimlinks publisherId/accountId is required');
  });

  it('surfaces provider errors without leaking credentials or access tokens', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'bad skim-client skim-secret 12345:1553009669:abc123abc123abc123',
    }));

    await expect(adapter.connect(ctx(), { clientId: 'skim-client' })).rejects.toThrow(
      'bad [redacted] [redacted] [redacted-token]',
    );
  });
});

function jsonTextResponse(body: unknown) {
  return {
    ok: true,
    text: async () => JSON.stringify(body),
  };
}
