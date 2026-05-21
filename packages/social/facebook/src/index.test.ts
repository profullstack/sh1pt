import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: { pageId: 'page_123' },
  samplePost: { body: 'hello from sh1pt contract tests' },
  requiredSecrets: ['META_PAGE_ACCESS_TOKEN'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-facebook Graph API posting', () => {
  it('creates a Page feed post with message, link, hashtags, and bearer auth', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'page_123_post_456' }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ META_PAGE_ACCESS_TOKEN: 'mock-page-access' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      body: 'Release shipped',
      link: 'https://sh1pt.com',
      hashtags: ['ship', 'typescript'],
    }, {
      pageId: 'page_123',
      apiVersion: 'v25.0',
      published: true,
    });

    expect(result).toEqual({
      id: 'page_123_post_456',
      url: 'https://www.facebook.com/page_123_post_456',
      platform: 'facebook',
      publishedAt: expect.any(String),
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://graph.facebook.com/v25.0/page_123/feed');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      authorization: 'Bearer mock-page-access',
      'content-type': 'application/x-www-form-urlencoded',
    });
    expect(Object.fromEntries(new URLSearchParams(String((init as RequestInit).body)))).toEqual({
      message: 'Release shipped #ship #typescript',
      link: 'https://sh1pt.com',
      published: 'true',
    });
  });

  it('creates a Page photo post when the first media item is a public image URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'photo_456', post_id: 'page_123_post_789' }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ META_PAGE_ACCESS_TOKEN: 'mock-page-access' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      body: 'Launch image',
      media: [{ file: 'https://cdn.example.com/launch.png', kind: 'image', alt: 'Launch image' }],
    }, {
      pageId: 'page_123',
      published: false,
    });

    expect(result.id).toBe('page_123_post_789');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://graph.facebook.com/v25.0/page_123/photos');
    expect(Object.fromEntries(new URLSearchParams(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)))).toEqual({
      url: 'https://cdn.example.com/launch.png',
      caption: 'Launch image',
      published: 'false',
    });
  });

  it('rejects local image paths because Facebook fetches image URLs server-side', async () => {
    const ctx = {
      ...fakeConnectContext({ META_PAGE_ACCESS_TOKEN: 'mock-page-access' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      body: 'Local image',
      media: [{ file: '/tmp/launch.png', kind: 'image' }],
    }, {
      pageId: 'page_123',
    })).rejects.toThrow('public http(s) URL');
  });

  it('surfaces Graph API errors without leaking the token value', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({
        error: {
          message: 'Invalid OAuth access token: mock-page-access',
          type: 'OAuthException',
          code: 190,
        },
      }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ META_PAGE_ACCESS_TOKEN: 'mock-page-access' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      body: 'Release shipped',
    }, {
      pageId: 'page_123',
    })).rejects.toThrow('Invalid OAuth access token: [redacted]');
  });
});
