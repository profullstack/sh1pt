import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = (secrets: Record<string, string> = { AMAZON_PAAPI_SECRET: 'amazon-secret' }) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

describe('Amazon Associates adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('requires PA-API credentials before probing the API', async () => {
    await expect(adapter.connect(ctx({}), {
      accessKey: 'AKIA_TEST',
      partnerTag: 'example-20',
    })).rejects.toThrow('AMAZON_PAAPI_SECRET not in vault');
    await expect(adapter.connect(ctx(), {
      partnerTag: 'example-20',
    })).rejects.toThrow('Amazon PA-API accessKey is required');
    await expect(adapter.connect(ctx(), {
      accessKey: 'AKIA_TEST',
    })).rejects.toThrow('Amazon Associates partnerTag is required');
  });

  it('signs a PA-API SearchItems probe during connect', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-21T03:00:00.000Z'));
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ SearchResult: { Items: [] } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(ctx(), {
      accessKey: 'AKIA_TEST',
      partnerTag: 'example-20',
    })).resolves.toEqual({ accountId: 'example-20' });

    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://webservices.amazon.com/paapi5/searchitems');
    expect(request.method).toBe('POST');
    expect(request.headers['content-encoding']).toBe('amz-1.0');
    expect(request.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(request.headers['x-amz-date']).toBe('20260521T030000Z');
    expect(request.headers['x-amz-target']).toBe(
      'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
    );
    expect(request.headers.authorization).toContain(
      'Credential=AKIA_TEST/20260521/us-east-1/ProductAdvertisingAPI/aws4_request',
    );
    expect(request.headers.authorization).toContain(
      'SignedHeaders=content-encoding;content-type;host;x-amz-date;x-amz-target',
    );
    expect(request.headers.authorization).not.toContain('amazon-secret');
    expect(JSON.parse(request.body)).toMatchObject({
      Keywords: 'sh1pt',
      PartnerTag: 'example-20',
      PartnerType: 'Associates',
      Marketplace: 'www.amazon.com',
    });
  });

  it('builds Amazon tagged links from an ASIN or supplied destination URL', async () => {
    await expect(adapter.getTrackingLink?.(ctx(), 'B08TEST123', '', {
      partnerTag: 'example-20',
      subtag: 'spring campaign!',
    })).resolves.toEqual({
      url: 'https://www.amazon.com/dp/B08TEST123?tag=example-20&ascsubtag=spring_campaign_',
    });

    await expect(adapter.getTrackingLink?.(
      ctx(),
      'B08TEST123',
      'https://www.amazon.co.uk/dp/B08TEST123?tag=existing-21',
      { partnerTag: 'example-20' },
    )).resolves.toEqual({
      url: 'https://www.amazon.co.uk/dp/B08TEST123?tag=existing-21',
    });
  });

  it('supports custom PA-API hosts, regions, and marketplaces', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-21T03:00:00.000Z'));
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ SearchResult: { Items: [] } }));
    vi.stubGlobal('fetch', fetchMock);

    await adapter.connect(ctx(), {
      accessKey: 'AKIA_TEST',
      apiHost: 'webservices.amazon.co.uk',
      marketplaceHost: 'www.amazon.co.uk',
      partnerTag: 'example-21',
      region: 'eu-west-1',
    });

    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://webservices.amazon.co.uk/paapi5/searchitems');
    expect(request.headers.authorization).toContain(
      'Credential=AKIA_TEST/20260521/eu-west-1/ProductAdvertisingAPI/aws4_request',
    );
    expect(JSON.parse(request.body).Marketplace).toBe('www.amazon.co.uk');
  });

  it('redacts PA-API credentials from provider error excerpts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'invalid AKIA_TEST / amazon-secret credentials',
    }));

    await expect(adapter.connect(ctx(), {
      accessKey: 'AKIA_TEST',
      partnerTag: 'example-20',
    })).rejects.toThrow('invalid [redacted] / [redacted] credentials');
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  };
}
