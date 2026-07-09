import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { createHash, createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = {
  secret: vi.fn((key: string) => (key === 'AMAZON_PAAPI_SECRET' ? 'fixture-paapi-secret' : undefined)),
  log: vi.fn(),
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  ctx.secret.mockClear();
  ctx.log.mockClear();
});

describe('amazon associates adapter', () => {
  it('builds Amazon Special Links with Associates tag and optional subtag', async () => {
    const link = await adapter.getTrackingLink?.(ctx, 'b00test123', '', {
      accountId: 'simone-20',
      accessKey: 'AKIAEXAMPLE',
      subtag: 'proof pass',
    });

    expect(link?.url).toBe('https://www.amazon.com/dp/B00TEST123/?tag=simone-20&ascsubtag=proof_pass');
  });

  it('adds the Associates tag to an existing Amazon URL without dropping query params', async () => {
    const link = await adapter.getTrackingLink?.(
      ctx,
      'unused-asin',
      'https://www.amazon.com/gp/product/B00TEST123?psc=1',
      {
        accountId: 'simone-20',
        accessKey: 'AKIAEXAMPLE',
      },
    );

    expect(link?.url).toBe('https://www.amazon.com/gp/product/B00TEST123?psc=1&tag=simone-20');
  });

  it('signs optional PA-API GetItems verification requests with SigV4 headers', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-05-21T03:04:05Z'));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ItemResults: { Items: [] } }));

    await adapter.connect(ctx, {
      accountId: 'simone-20',
      accessKey: 'AKIAEXAMPLE',
      apiBase: 'https://webservices.example.test',
      marketplace: 'www.amazon.com',
      testAsin: 'B00TEST123',
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://webservices.example.test/paapi5/getitems');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBe(JSON.stringify({
      ItemIds: ['B00TEST123'],
      ItemIdType: 'ASIN',
      Marketplace: 'www.amazon.com',
      PartnerTag: 'simone-20',
      PartnerType: 'Associates',
      Resources: [
        'Images.Primary.Small',
        'ItemInfo.Title',
        'OffersV2.Listings.Price',
      ],
    }));
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-amz-date']).toBe('20260521T030405Z');
    expect(headers['x-amz-target']).toBe('com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems');
    expect(headers.authorization).toBe(expectedAuthorization(headers, String((init as RequestInit).body)));
  });

  it('redacts PA-API credentials from error bodies', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      'bad AKIAEXAMPLE fixture-paapi-secret simone-20',
      { status: 401 },
    ));

    await expect(adapter.connect(ctx, {
      accountId: 'simone-20',
      accessKey: 'AKIAEXAMPLE',
      apiBase: 'https://webservices.example.test',
      testAsin: 'B00TEST123',
    })).rejects.toThrow('bad [redacted] [redacted] [redacted]');
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function expectedAuthorization(headers: Record<string, string>, payload: string): string {
  const contentType = 'application/json; charset=utf-8';
  const amzDate = headers['x-amz-date'] ?? '';
  const dateStamp = amzDate.slice(0, 8);
  const region = 'us-east-1';
  const service = 'ProductAdvertisingAPI';
  const signedHeaders = 'content-encoding;content-type;host;x-amz-date;x-amz-target';
  const canonicalHeaders = [
    'content-encoding:amz-1.0',
    `content-type:${contentType}`,
    'host:webservices.example.test',
    `x-amz-date:${amzDate}`,
    `x-amz-target:${headers['x-amz-target']}`,
    '',
  ].join('\n');
  const canonicalRequest = [
    'POST',
    '/paapi5/getitems',
    '',
    canonicalHeaders,
    signedHeaders,
    sha256(payload),
  ].join('\n');
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join('\n');
  const signingKey = hmac(hmac(hmac(hmac('AWS4fixture-paapi-secret', dateStamp), region), service), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return `AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}
