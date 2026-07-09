import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: { mode: 'api' },
  samplePost: { body: 'hello from sh1pt contract tests' },
  requiredSecrets: ['X_BEARER_TOKEN'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-x API posting', () => {
  it('creates a text Post through X API v2', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: '1445880548472328192',
          text: 'Release shipped #ship',
        },
      }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ X_BEARER_TOKEN: 'x-token' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      body: 'Release shipped',
      hashtags: ['ship'],
    }, {
      mode: 'api',
    });

    expect(result).toEqual({
      id: '1445880548472328192',
      url: 'https://x.com/i/web/status/1445880548472328192',
      platform: 'x',
      publishedAt: expect.any(String),
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.x.com/2/tweets');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      authorization: 'Bearer x-token',
      'content-type': 'application/json',
    });
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      text: 'Release shipped #ship',
    });
  });

  it('passes reply and pre-uploaded media ids to the API payload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: '1445880548472328193', text: 'Photo' } }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ X_BEARER_TOKEN: 'x-token' }),
      dryRun: false,
    };

    await adapter.post(ctx as any, {
      body: 'Photo',
      media: [{ file: '/tmp/photo.jpg', kind: 'image' }],
    }, {
      mode: 'api',
      mediaIds: ['1234567890123456789'],
      replyToPostId: '1111111111111111111',
    });

    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      text: 'Photo',
      media: { media_ids: ['1234567890123456789'] },
      reply: { in_reply_to_tweet_id: '1111111111111111111' },
    });
  });

  it('rejects media attachments without pre-uploaded media ids', async () => {
    const ctx = {
      ...fakeConnectContext({ X_BEARER_TOKEN: 'x-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      body: 'Photo',
      media: [{ file: '/tmp/photo.jpg', kind: 'image' }],
    }, {
      mode: 'api',
    })).rejects.toThrow('pre-uploaded media IDs');
  });

  it('surfaces X API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({
        errors: [{ title: 'Unauthorized', detail: 'Invalid or expired token' }],
      }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ X_BEARER_TOKEN: 'x-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      body: 'Release shipped',
    }, {
      mode: 'api',
    })).rejects.toThrow('Invalid or expired token');
  });
});
