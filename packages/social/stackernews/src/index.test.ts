import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: { territory: 'meta' },
  samplePost: { title: 'Hello Stacker News', body: 'hello from sh1pt contract tests' },
  requiredSecrets: ['STACKERNEWS_COOKIE'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-stackernews GraphQL posting', () => {
  it('creates a link post with the Stacker News upsertLink mutation', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          upsertLink: {
            id: 55,
            createdAt: '2026-05-21T00:00:00.000Z',
            item: {
              id: 123,
              title: 'Release shipped',
              url: 'https://sh1pt.com',
              createdAt: '2026-05-21T00:01:00.000Z',
            },
          },
        },
      }),
    } as any);

    const ctx = {
      ...fakeConnectContext({ STACKERNEWS_COOKIE: 'next-auth.session-token=test' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      title: 'Release shipped',
      body: 'Article body',
      link: 'https://sh1pt.com',
      hashtags: ['bitcoin', 'shipping', 'automation', 'ignored'],
    }, {
      territory: 'bitcoin',
      apiUrl: 'https://stacker.test/api/graphql',
    });

    expect(result).toEqual({
      id: '123',
      url: 'https://stacker.news/items/123',
      platform: 'stackernews',
      publishedAt: '2026-05-21T00:01:00.000Z',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://stacker.test/api/graphql');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'content-type': 'application/json',
      cookie: 'next-auth.session-token=test',
    });

    const body = JSON.parse(String(init.body));
    expect(body.query).toContain('upsertLink');
    expect(body.variables).toEqual({
      subNames: ['bitcoin'],
      title: 'Release shipped',
      url: 'https://sh1pt.com',
      text: 'Article body\n\n#bitcoin #shipping #automation',
    });
  });

  it('creates a discussion post when no link is present', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          upsertDiscussion: {
            id: 56,
            createdAt: '2026-05-21T00:00:00.000Z',
            item: { id: 124, title: 'Ask SN', createdAt: '2026-05-21T00:02:00.000Z' },
          },
        },
      }),
    } as any);

    const ctx = {
      ...fakeConnectContext({ STACKERNEWS_COOKIE: 'next-auth.session-token=test' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      title: 'Ask SN',
      body: 'What should sh1pt support next?',
    }, { territory: 'meta', apiUrl: 'https://stacker.test/api/graphql' })).resolves.toMatchObject({
      id: '124',
      url: 'https://stacker.news/items/124',
    });

    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.query).toContain('upsertDiscussion');
    expect(body.variables).toMatchObject({
      subNames: ['meta'],
      title: 'Ask SN',
      text: 'What should sh1pt support next?',
    });
  });

  it('throws GraphQL error messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ errors: [{ message: 'insufficient sats' }] }),
    } as any);

    const ctx = {
      ...fakeConnectContext({ STACKERNEWS_COOKIE: 'next-auth.session-token=test' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      title: 'Release shipped',
      body: 'Article body',
      link: 'https://sh1pt.com',
    }, { apiUrl: 'https://stacker.test/api/graphql' })).rejects.toThrow('insufficient sats');
  });
});
