import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: { boardId: 'board_123' },
  samplePost: {
    title: 'Hello Pinterest',
    body: 'hello from sh1pt contract tests',
    media: [{ file: 'https://cdn.example.com/pin.jpg', kind: 'image', alt: 'Example image' }],
  },
  requiredSecrets: ['PINTEREST_ACCESS_TOKEN'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-pinterest posting', () => {
  it('creates an image Pin from an HTTPS media URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: '654321654321654321',
        created_at: '2026-05-16T19:00:00',
      }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ PINTEREST_ACCESS_TOKEN: 'pinterest-token' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      title: 'Launch visual',
      body: 'Launch screenshot',
      hashtags: ['ship', 'design'],
      link: 'https://sh1pt.com',
      media: [{ file: 'https://cdn.example.com/launch.jpg', kind: 'image', alt: 'Launch screenshot' }],
    }, {
      boardId: 'board_123',
      boardSectionId: 'section_456',
      isStandard: false,
    });

    expect(result).toEqual({
      id: '654321654321654321',
      url: 'https://www.pinterest.com/pin/654321654321654321/',
      platform: 'pinterest',
      publishedAt: '2026-05-16T19:00:00.000Z',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.pinterest.com/v5/pins');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      authorization: 'Bearer pinterest-token',
      accept: 'application/json',
      'content-type': 'application/json',
    });
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      board_id: 'board_123',
      board_section_id: 'section_456',
      title: 'Launch visual',
      description: 'Launch screenshot #ship #design',
      link: 'https://sh1pt.com',
      alt_text: 'Launch screenshot',
      media_source: {
        source_type: 'image_url',
        url: 'https://cdn.example.com/launch.jpg',
        is_standard: false,
      },
    });
  });

  it('creates a video Pin from a pre-uploaded Pinterest media id', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: '987654321' }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ PINTEREST_ACCESS_TOKEN: 'pinterest-token' }),
      dryRun: false,
    };

    await adapter.post(ctx as any, {
      title: 'Video launch',
      body: 'Video body',
      media: [{ file: '/tmp/video.mp4', kind: 'video' }],
    }, {
      boardId: 'board_123',
      videoMediaId: 'media_123',
      coverImageUrl: 'https://cdn.example.com/cover.jpg',
    });

    const payload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(payload.media_source).toEqual({
      source_type: 'video_id',
      media_id: 'media_123',
      cover_image_url: 'https://cdn.example.com/cover.jpg',
    });
  });

  it('rejects local image paths because Pinterest image_url requires a URL', async () => {
    const ctx = {
      ...fakeConnectContext({ PINTEREST_ACCESS_TOKEN: 'pinterest-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      title: 'Local image',
      body: 'Body',
      media: [{ file: '/tmp/pin.jpg', kind: 'image' }],
    }, {
      boardId: 'board_123',
    })).rejects.toThrow('http(s) image URL');
  });

  it('surfaces Pinterest API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ code: 1, message: 'The Pin image is broken' }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ PINTEREST_ACCESS_TOKEN: 'pinterest-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      title: 'Broken image',
      body: 'Body',
      media: [{ file: 'https://cdn.example.com/broken.jpg', kind: 'image' }],
    }, {
      boardId: 'board_123',
    })).rejects.toThrow('The Pin image is broken');
  });
});
