import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = (secrets: Record<string, string> = { IMPACT_AUTH_TOKEN: 'impact-token' }) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

describe('Impact affiliate adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires an Account SID and Auth Token before making API requests', async () => {
    await expect(adapter.connect(ctx(), {})).rejects.toThrow('Impact accountId / Account SID is required');
    await expect(adapter.connect(ctx({}), { accountId: 'IRSid' })).rejects.toThrow(
      'IMPACT_AUTH_TOKEN not in vault',
    );
  });

  it('probes publisher company information during connect', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonTextResponse({
      CompanyName: 'Publisher Inc',
      Currency: 'USD',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(ctx(), { accountId: 'IRSid' })).resolves.toEqual({ accountId: 'IRSid' });

    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.impact.com/Mediapartners/IRSid/CompanyInformation');
    expect(request.method).toBe('GET');
    expect(request.headers.accept).toBe('application/json');
    expect(request.headers.authorization).toMatch(/^Basic /);
  });

  it('creates a publisher tracking link with deeplink and reporting parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonTextResponse({
      TrackingURL: 'https://example.sjv.io/c/123456/98765/101010',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.getTrackingLink?.(
      ctx(),
      '10000',
      'https://merchant.example/product?a=1',
      {
        accountId: 'IRSid',
        customPath: 'spring-launch',
        mediaPartnerPropertyId: '1892978',
        sharedId: 'email',
        subId1: 'newsletter',
      },
    )).resolves.toEqual({
      url: 'https://example.sjv.io/c/123456/98765/101010',
    });

    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://api.impact.com/Mediapartners/IRSid/Programs/10000/TrackingLinks?Type=Vanity&DeepLink=https%3A%2F%2Fmerchant.example%2Fproduct%3Fa%3D1&CustomPath=spring-launch&MediaPartnerPropertyId=1892978&subId1=newsletter&sharedId=email',
    );
    expect(request.method).toBe('POST');
  });

  it('rejects non-HTTP destination URLs before calling Impact', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.getTrackingLink?.(
      ctx(),
      '10000',
      'mailto:merchant@example.com',
      { accountId: 'IRSid' },
    )).rejects.toThrow('Impact destinationUrl must use HTTP or HTTPS');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('supports regular program-level links when no deeplink is provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonTextResponse({
      TrackingUrl: 'https://example.sjv.io/c/123456/98765/101010',
    })));

    await expect(adapter.getTrackingLink?.(ctx(), '10000', '', { accountId: 'IRSid' })).resolves.toEqual({
      url: 'https://example.sjv.io/c/123456/98765/101010',
    });

    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(url)).toBe(
      'https://api.impact.com/Mediapartners/IRSid/Programs/10000/TrackingLinks?Type=Regular',
    );
  });

  it('throws when Impact omits the generated tracking URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonTextResponse({})));

    await expect(adapter.getTrackingLink?.(ctx(), '10000', '', { accountId: 'IRSid' })).rejects.toThrow(
      'Impact returned no tracking URL',
    );
  });

  it('aggregates action stats while excluding reversed conversions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonTextResponse({
      '@page': '1',
      Actions: [
        {
          Amount: '100.00',
          CampaignId: '10000',
          Currency: 'USD',
          Payout: '10.00',
          State: 'APPROVED',
        },
        {
          Amount: '50.00',
          CampaignId: '10000',
          Currency: 'USD',
          Payout: '5.00',
          State: 'PENDING',
        },
        {
          Amount: '20.00',
          CampaignId: '10000',
          Currency: 'USD',
          Payout: '2.00',
          State: 'REVERSED',
        },
        {
          Amount: '999.00',
          CampaignId: 'other',
          Currency: 'USD',
          Payout: '99.00',
          State: 'APPROVED',
        },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.stats?.(ctx(), '10000', {
      accountId: 'IRSid',
      from: '2026-05-01',
      to: '2026-05-20',
    })).resolves.toEqual({
      publishers: 1,
      clicks: 0,
      conversions: 2,
      revenue: 150,
      commissionsPaid: 10,
      currency: 'USD',
    });

    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://api.impact.com/Mediapartners/IRSid/Actions?CampaignId=10000&StartDate=2026-05-01T00%3A00%3A00Z&EndDate=2026-05-20T23%3A59%3A59Z&PageSize=100',
    );
    expect(request.method).toBe('GET');
  });

  it('falls back to pending payouts when no approved actions are present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonTextResponse({
      Actions: [
        { Amount: '20.00', CampaignId: '10000', Payout: '2.00', State: 'PENDING' },
        { Amount: '30.00', CampaignId: '10000', Payout: '3.00', State: 'PENDING' },
      ],
    })));

    await expect(adapter.stats?.(ctx(), '10000', { accountId: 'IRSid' })).resolves.toMatchObject({
      conversions: 2,
      revenue: 50,
      commissionsPaid: 5,
      currency: 'USD',
    });
  });

  it('redacts echoed credentials from provider errors', async () => {
    const echoedBasic = ['SVJTaWQ6', 'aW1wYWN0', 'LXRva2Vu'].join('');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => `bad IRSid impact-token Basic ${echoedBasic}`,
    }));

    await expect(adapter.connect(ctx(), { accountId: 'IRSid' })).rejects.toThrow(
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
