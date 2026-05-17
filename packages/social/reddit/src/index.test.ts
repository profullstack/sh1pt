import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: { subreddit: 'sh1pt' },
  samplePost: { title: 'Release shipped', body: 'hello from sh1pt contract tests' },
  requiredSecrets: ['REDDIT_ACCESS_TOKEN'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-reddit posting', () => {
  it('submits text posts to Reddit with an OAuth bearer token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        json: {
          data: {
            id: 'abc123',
            url: 'https://www.reddit.com/r/sh1pt/comments/abc123/release_shipped/',
          },
          errors: [],
        },
      }),
    } as any);

    const ctx = {
      ...fakeConnectContext({ REDDIT_ACCESS_TOKEN: 'reddit-token' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      title: 'Release shipped',
      body: 'Article body',
    }, {
      subreddit: 'sh1pt',
      kind: 'self',
      flairId: 'flair_1',
    });

    expect(result).toEqual({
      id: 'abc123',
      url: 'https://www.reddit.com/r/sh1pt/comments/abc123/release_shipped/',
      platform: 'reddit',
      publishedAt: expect.any(String),
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://oauth.reddit.com/api/submit');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      authorization: 'Bearer reddit-token',
      'content-type': 'application/x-www-form-urlencoded',
    });
    const body = new URLSearchParams(String((init as RequestInit).body));
    expect(Object.fromEntries(body)).toMatchObject({
      api_type: 'json',
      flair_id: 'flair_1',
      kind: 'self',
      sr: 'sh1pt',
      text: 'Article body',
      title: 'Release shipped',
    });
  });

  it('surfaces Reddit submit errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        json: {
          data: {},
          errors: [['RATELIMIT', 'you are doing that too much', 'ratelimit']],
        },
      }),
    } as any);

    const ctx = {
      ...fakeConnectContext({ REDDIT_ACCESS_TOKEN: 'reddit-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      title: 'Release shipped',
      body: 'Article body',
    }, {
      subreddit: 'sh1pt',
    })).rejects.toThrow('RATELIMIT: you are doing that too much');
  });
});
