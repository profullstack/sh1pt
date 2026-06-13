import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = (secrets: Record<string, string> = { EBAY_EPN_AUTH_TOKEN: 'epn-token' }) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

describe('eBay Partner Network affiliate adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires an Account SID and Auth Token for reporting calls', async () => {
    await expect(adapter.connect(ctx(), {})).rejects.toThrow('eBay Partner accountId / Account SID is required');
    await expect(adapter.connect(ctx({}), { accountId: 'account-sid' })).rejects.toThrow(
      'EBAY_EPN_AUTH_TOKEN not in vault',
    );
  });

  it('probes the Partner Reporting API during connect', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonTextResponse({ Records: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(ctx(), {
      accountId: 'account-sid',
      campaignId: '5338461150',
      from: '2026-05-20',
      to: '2026-05-21',
    })).resolves.toEqual({ accountId: 'account-sid' });

    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://api.partner.ebay.com/Mediapartners/account-sid/Reports/ebay_partner_perf_by_day.json?CAMPAIGN_ID=5338461150&CHECKOUT_SITE=0&START_DATE=2026-05-20&END_DATE=2026-05-21',
    );
    expect(request.method).toBe('GET');
    expect(request.headers.accept).toBe('application/json');
    expect(request.headers.authorization).toMatch(/^Basic /);
  });

  it('builds official EPN tracking links with campaign, rotation, tool, and custom IDs', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx(),
      '5338461150',
      'https://www.ebay.com/itm/1234567890?var=987',
      { customId: 'spring-1', rotationId: '711-53200-19255-0', toolId: '10050' },
    )).resolves.toEqual({
      url: 'https://www.ebay.com/itm/1234567890?var=987&mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=5338461150&toolid=10050&customid=spring-1',
    });
  });

  it('uses configured defaults and appends priority listing payloads', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx(),
      '',
      'https://www.ebay.co.uk/itm/111',
      {
        campaignId: '1234567890',
        channelId: '16',
        eventType: '1',
        priorityListingPayload: 'enc%3Aabc',
        rotationId: '710-53481-19255-0',
      },
    )).resolves.toEqual({
      url: 'https://www.ebay.co.uk/itm/111?mkevt=1&mkcid=16&mkrid=710-53481-19255-0&campid=1234567890&toolid=10001&amdata=enc%253Aabc',
    });
  });

  it('requires a campaign id and absolute destination for tracking links', async () => {
    await expect(adapter.getTrackingLink?.(ctx(), '', 'https://www.ebay.com/itm/123', {})).rejects.toThrow(
      'campaignId is required',
    );
    await expect(adapter.getTrackingLink?.(ctx(), '5338461150', 'not-a-url', {})).rejects.toThrow(
      'destinationUrl must be an absolute URL',
    );
  });

  it('rejects non-HTTP destination URLs', async () => {
    await expect(adapter.getTrackingLink?.(
      ctx(),
      '5338461150',
      'javascript:alert(1)',
      {},
    )).rejects.toThrow('destinationUrl must use HTTP or HTTPS');
  });

  it('aggregates Partner Reporting campaign metrics', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonTextResponse({
      Records: [
        {
          CampaignId: '5338461150',
          Clicks: '12',
          Earnings: '$3.25',
          Sales: '100.50',
          Transactions: '2',
        },
        {
          CampaignId: '5338461150',
          Clicks: 3,
          Earnings: 1.25,
          Sales: 20,
          Transactions: 1,
        },
        {
          CampaignId: 'other',
          Clicks: 99,
          Earnings: 99,
          Sales: 999,
          Transactions: 99,
        },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.stats?.(ctx(), '5338461150', {
      accountId: 'account-sid',
      checkoutSite: 'US',
      currency: 'USD',
      from: '2026-05-01',
      to: '2026-05-20',
    })).resolves.toEqual({
      publishers: 1,
      clicks: 15,
      conversions: 3,
      revenue: 120.5,
      commissionsPaid: 4.5,
      currency: 'USD',
    });

    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://api.partner.ebay.com/Mediapartners/account-sid/Reports/ebay_partner_perf_by_campaign.json?CAMPAIGN_ID=5338461150&CHECKOUT_SITE=US&START_DATE=2026-05-01&END_DATE=2026-05-20',
    );
    expect(request.headers.authorization).toMatch(/^Basic /);
  });

  it('falls back to all returned rows when report rows omit campaign ids', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonTextResponse([
      { Clicks: '4', Earnings: '2.00', Sales: '40.00', Transactions: '1' },
      { Clicks: '6', Earnings: '3.00', Sales: '60.00', Transactions: '2' },
    ])));

    await expect(adapter.stats?.(ctx(), '5338461150', { accountId: 'account-sid' })).resolves.toMatchObject({
      clicks: 10,
      conversions: 3,
      revenue: 100,
      commissionsPaid: 5,
    });
  });

  it('accepts legacy EBAY_EPN_TOKEN vault entries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonTextResponse({ Records: [] })));

    await expect(adapter.connect(ctx({ EBAY_EPN_TOKEN: 'legacy-token' }), { accountId: 'account-sid' }))
      .resolves.toEqual({ accountId: 'account-sid' });
  });

  it('redacts echoed reporting credentials from provider errors', async () => {
    const echoedBasic = ['YWNjb3VudA', '=='].join('');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => `bad account-sid epn-token Basic ${echoedBasic}`,
    }));

    await expect(adapter.connect(ctx(), { accountId: 'account-sid' })).rejects.toThrow(
      'bad [redacted] [redacted] Basic [redacted]',
    );
  });
});

function jsonTextResponse(body: unknown) {
  return {
    ok: true,
    text: async () => JSON.stringify(body),
  };
}
