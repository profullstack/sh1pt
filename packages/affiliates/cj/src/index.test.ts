import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'affiliate' });

const ctx = (secrets: Record<string, string> = { CJ_PERSONAL_ACCESS_TOKEN: 'cj-token' }) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

describe('CJ affiliate adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a CJ personal access token before making requests', async () => {
    await expect(adapter.connect(ctx({}), {})).rejects.toThrow('CJ_PERSONAL_ACCESS_TOKEN not in vault');
  });

  it('preserves the configured publisher company id on connect', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(ctx(), { accountId: '999', websiteId: '12345' })).resolves.toEqual({
      accountId: '999',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('generates a publisher tracking link through Link Search and applies deep-link destinations', async () => {
    const fetchMock = vi.fn().mockResolvedValue(xmlResponse(`
      <cj-api>
        <links total-matched="1" records-returned="1" page-number="1">
          <link>
            <advertiser-id>15058</advertiser-id>
            <allow-deep-linking>true</allow-deep-linking>
            <clickUrl>https://www.kqzyfj.com/click-12345-67890?url=https%3A%2F%2Fold.example</clickUrl>
          </link>
        </links>
      </cj-api>
    `));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.getTrackingLink?.(
      ctx(),
      '15058',
      'https://merchant.example/product?a=1',
      { websiteId: '12345', keywords: 'spring sale' },
    )).resolves.toEqual({
      url: 'https://www.kqzyfj.com/click-12345-67890?url=https%3A%2F%2Fmerchant.example%2Fproduct%3Fa%3D1',
    });

    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://link-search.api.cj.com/v2/link-search?website-id=12345&advertiser-ids=15058&records-per-page=10&page-number=1&allow-deep-linking=true&keywords=spring+sale',
    );
    expect(request.headers.authorization).toBe('Bearer cj-token');
  });

  it('rejects non-HTTP destination URLs before calling Link Search', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.getTrackingLink?.(
      ctx(),
      '15058',
      'data:text/html,hello',
      { websiteId: '12345' },
    )).rejects.toThrow('CJ destinationUrl must use HTTP or HTTPS');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the first HTML href when Link Search omits clickUrl', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(xmlResponse(`
      <cj-api>
        <link-code-html>
          <a href="https://www.tkqlhce.com/click-12345-67890">Offer</a>
        </link-code-html>
      </cj-api>
    `)));

    await expect(adapter.getTrackingLink?.(ctx(), '15058', '', { websiteId: '12345' })).resolves.toEqual({
      url: 'https://www.tkqlhce.com/click-12345-67890',
    });
  });

  it('requires a Website ID for tracking links', async () => {
    await expect(adapter.getTrackingLink?.(ctx(), '15058', '', {})).rejects.toThrow(
      'CJ websiteId is required',
    );
  });

  it('aggregates publisher commission detail records', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonTextResponse({
      data: {
        publisherCommissions: {
          count: 2,
          payloadComplete: true,
          records: [
            {
              advertiserId: '15058',
              saleAmountUsd: '75.00',
              pubCommissionAmountUsd: '7.50',
            },
            {
              advertiserId: '15058',
              saleAmountUsd: 25,
              pubCommissionAmountUsd: '2.25',
            },
          ],
        },
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.stats?.(ctx(), '15058', {
      accountId: '999',
      from: '2026-05-01',
      to: '2026-05-20',
    })).resolves.toEqual({
      publishers: 1,
      clicks: 0,
      conversions: 2,
      revenue: 100,
      commissionsPaid: 9.75,
      currency: 'USD',
    });

    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://commissions.api.cj.com/query');
    expect(request.method).toBe('POST');
    expect(request.headers.authorization).toBe('Bearer cj-token');
    expect(request.body).toContain('publisherCommissions');
    expect(request.body).toContain('forPublishers: ["999"]');
    expect(request.body).toContain('advertiserIds: ["15058"]');
    expect(request.body).toContain('sincePostingDate: "2026-05-01T00:00:00Z"');
    expect(request.body).toContain('beforePostingDate: "2026-05-20T23:59:59Z"');
  });

  it('requires a publisher company id for commission stats', async () => {
    await expect(adapter.stats?.(ctx(), '15058', {})).rejects.toThrow(
      'CJ accountId / publisher CID is required',
    );
  });

  it('surfaces GraphQL errors without leaking echoed tokens', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonTextResponse({
      errors: [{ message: 'Invalid auth token cj-token' }],
    })));

    await expect(adapter.stats?.(ctx(), '15058', { accountId: '999' })).rejects.toThrow(
      'Invalid auth token [redacted]',
    );
  });

  it('surfaces REST errors without leaking echoed tokens', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Not Authenticated: cj-token',
    }));

    await expect(adapter.getTrackingLink?.(ctx(), '15058', '', { websiteId: '12345' })).rejects.toThrow(
      'Not Authenticated: [redacted]',
    );
  });

  it('accepts legacy CJ_DEVELOPER_KEY vault entries', async () => {
    await expect(adapter.connect(ctx({ CJ_DEVELOPER_KEY: 'legacy-token' }), {})).resolves.toEqual({
      accountId: 'affiliate-cj',
    });
  });
});

function xmlResponse(body: string) {
  return {
    ok: true,
    text: async () => body,
  };
}

function jsonTextResponse(body: unknown) {
  return {
    ok: true,
    text: async () => JSON.stringify(body),
  };
}
