import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: { threadsUserId: 'me' },
  samplePost: { body: 'hello from sh1pt contract tests' },
  requiredSecrets: ['THREADS_ACCESS_TOKEN'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-threads publishing', () => {
  it('creates and publishes a text Thread', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'container_123' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'thread_123' }),
      } as Response);

    const ctx = {
      ...fakeConnectContext({ THREADS_ACCESS_TOKEN: 'threads-token' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      body: 'Release shipped',
      hashtags: ['ship', 'typescript'],
      link: 'https://sh1pt.com',
    }, {
      threadsUserId: 'me',
    });

    expect(result).toEqual({
      id: 'thread_123',
      url: 'https://www.threads.net/',
      platform: 'threads',
      publishedAt: expect.any(String),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://graph.threads.net/v1.0/me/threads');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({
      'content-type': 'application/x-www-form-urlencoded',
    });
    expect(Object.fromEntries(new URLSearchParams(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)))).toEqual({
      media_type: 'TEXT',
      text: 'Release shipped\nhttps://sh1pt.com #ship #typescript',
      access_token: 'threads-token',
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://graph.threads.net/v1.0/me/threads_publish');
    expect(Object.fromEntries(new URLSearchParams(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body)))).toEqual({
      creation_id: 'container_123',
      access_token: 'threads-token',
    });
  });

  it('creates an image container when media is a public URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'container_456' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'thread_456' }),
      } as Response);

    const ctx = {
      ...fakeConnectContext({ THREADS_ACCESS_TOKEN: 'threads-token' }),
      dryRun: false,
    };

    await adapter.post(ctx as any, {
      body: 'Image post',
      media: [{ file: 'https://cdn.example.com/thread.jpg', kind: 'image' }],
    }, {
      threadsUserId: '17841400000000000',
      apiVersion: 'v1.0',
    });

    const payload = Object.fromEntries(new URLSearchParams(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)));
    expect(payload).toMatchObject({
      media_type: 'IMAGE',
      image_url: 'https://cdn.example.com/thread.jpg',
      text: 'Image post',
      access_token: 'threads-token',
    });
  });

  it('rejects local media paths because Threads fetches media from public URLs', async () => {
    const ctx = {
      ...fakeConnectContext({ THREADS_ACCESS_TOKEN: 'threads-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      body: 'Image post',
      media: [{ file: '/tmp/thread.jpg', kind: 'image' }],
    }, {
      threadsUserId: 'me',
    })).rejects.toThrow('public http(s) URL');
  });

  it('surfaces Threads API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({
        error: {
          message: 'Invalid OAuth access token',
          type: 'OAuthException',
          code: 190,
        },
      }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ THREADS_ACCESS_TOKEN: 'threads-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      body: 'Release shipped',
    }, {
      threadsUserId: 'me',
    })).rejects.toThrow('Invalid OAuth access token');
  });
});
