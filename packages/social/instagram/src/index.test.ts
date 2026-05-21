import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: { igUserId: '17841400000000000', pageId: 'page_123' },
  samplePost: { body: 'hello from sh1pt contract tests', media: [{ file: 'https://cdn.example.com/photo.jpg', kind: 'image' }] },
  requiredSecrets: ['INSTAGRAM_ACCESS_TOKEN'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-instagram publishing', () => {
  it('creates and publishes an image container from a public image URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'container_123' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'media_123' }),
      } as Response);

    const ctx = {
      ...fakeConnectContext({ INSTAGRAM_ACCESS_TOKEN: 'mock-instagram-access' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      body: 'Release shipped',
      link: 'https://sh1pt.com',
      hashtags: ['ship', 'typescript'],
      media: [{ file: 'https://cdn.example.com/ig.jpg', kind: 'image', alt: 'Launch screenshot' }],
    }, {
      igUserId: '17841400000000000',
      pageId: 'page_123',
      apiVersion: 'v25.0',
    });

    expect(result).toEqual({
      id: 'media_123',
      url: 'https://www.instagram.com/',
      platform: 'instagram',
      publishedAt: expect.any(String),
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://graph.instagram.com/v25.0/17841400000000000/media');
    expect(Object.fromEntries(new URLSearchParams(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)))).toEqual({
      access_token: 'mock-instagram-access',
      image_url: 'https://cdn.example.com/ig.jpg',
      alt_text: 'Launch screenshot',
      caption: 'Release shipped\nhttps://sh1pt.com #ship #typescript',
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://graph.instagram.com/v25.0/17841400000000000/media_publish');
    expect(Object.fromEntries(new URLSearchParams(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body)))).toEqual({
      access_token: 'mock-instagram-access',
      creation_id: 'container_123',
    });
  });

  it('waits for video container processing before publishing a reel', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'video_container' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status_code: 'IN_PROGRESS' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status_code: 'FINISHED' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'reel_123' }),
      } as Response);

    const ctx = {
      ...fakeConnectContext({ INSTAGRAM_ACCESS_TOKEN: 'mock-instagram-access' }),
      dryRun: false,
    };

    await adapter.post(ctx as any, {
      body: 'Reel body',
      media: [{ file: 'https://cdn.example.com/reel.mp4', kind: 'video' }],
    }, {
      igUserId: '17841400000000000',
      pageId: 'page_123',
      format: 'reel',
      pollAttempts: 3,
      pollIntervalMs: 0,
    });

    expect(Object.fromEntries(new URLSearchParams(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)))).toEqual({
      access_token: 'mock-instagram-access',
      video_url: 'https://cdn.example.com/reel.mp4',
      media_type: 'REELS',
      caption: 'Reel body',
    });
    const statusUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(`${statusUrl.origin}${statusUrl.pathname}`).toBe('https://graph.instagram.com/v25.0/video_container');
    expect(statusUrl.searchParams.get('access_token')).toBe('mock-instagram-access');
    expect(statusUrl.searchParams.get('fields')).toBe('status_code');
    expect(fetchMock.mock.calls[3]?.[0]).toBe('https://graph.instagram.com/v25.0/17841400000000000/media_publish');
  });

  it('creates carousel child containers before publishing the carousel container', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'child_1' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'child_2' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'carousel_1' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'media_carousel' }),
      } as Response);

    const ctx = {
      ...fakeConnectContext({ INSTAGRAM_ACCESS_TOKEN: 'mock-instagram-access' }),
      dryRun: false,
    };

    await adapter.post(ctx as any, {
      body: 'Carousel body',
      media: [
        { file: 'https://cdn.example.com/one.jpg', kind: 'image' },
        { file: 'https://cdn.example.com/two.jpg', kind: 'image' },
      ],
    }, {
      igUserId: '17841400000000000',
      pageId: 'page_123',
      format: 'carousel',
    });

    expect(Object.fromEntries(new URLSearchParams(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)))).toMatchObject({
      image_url: 'https://cdn.example.com/one.jpg',
      is_carousel_item: 'true',
    });
    expect(Object.fromEntries(new URLSearchParams(String((fetchMock.mock.calls[2]?.[1] as RequestInit).body)))).toEqual({
      access_token: 'mock-instagram-access',
      media_type: 'CAROUSEL',
      children: 'child_1,child_2',
      caption: 'Carousel body',
    });
  });

  it('rejects local media paths because Instagram fetches public URLs server-side', async () => {
    const ctx = {
      ...fakeConnectContext({ INSTAGRAM_ACCESS_TOKEN: 'mock-instagram-access' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      body: 'Local image',
      media: [{ file: '/tmp/ig.jpg', kind: 'image' }],
    }, {
      igUserId: '17841400000000000',
      pageId: 'page_123',
    })).rejects.toThrow('public http(s) URL');
  });

  it('redacts access tokens from Instagram API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({
        error: {
          message: 'Invalid OAuth access token: mock-instagram-access',
          type: 'OAuthException',
          code: 190,
        },
      }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ INSTAGRAM_ACCESS_TOKEN: 'mock-instagram-access' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      body: 'Broken image',
      media: [{ file: 'https://cdn.example.com/broken.jpg', kind: 'image' }],
    }, {
      igUserId: '17841400000000000',
      pageId: 'page_123',
    })).rejects.toThrow('Invalid OAuth access token: [redacted]');
  });
});
