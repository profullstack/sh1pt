import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: { mode: 'api-legacy', publishStatus: 'draft' },
  samplePost: { title: 'Hello Medium', body: 'hello from sh1pt contract tests' },
  requiredSecrets: ['MEDIUM_INTEGRATION_TOKEN'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-medium legacy API posting', () => {
  it('fetches the authenticated user id and creates a profile draft post', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: 'author_123', username: 'sh1pt' },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          id: 'post_123',
          url: 'https://medium.com/@sh1pt/hello-medium-post_123',
          publishedAt: 1_775_000_000_000,
        },
      }), { status: 201, headers: { 'content-type': 'application/json' } }));

    const ctx = {
      ...fakeConnectContext({ MEDIUM_INTEGRATION_TOKEN: 'medium-token' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      title: 'Hello Medium',
      body: 'Release notes',
      hashtags: ['launch', 'typescript', 'automation', 'ignored'],
      link: 'https://sh1pt.com',
    }, {
      mode: 'api-legacy',
      canonicalUrl: 'https://example.com/original',
      publishStatus: 'draft',
      notifyFollowers: false,
    });

    expect(result).toEqual({
      id: 'post_123',
      url: 'https://medium.com/@sh1pt/hello-medium-post_123',
      platform: 'medium',
      publishedAt: '2026-03-31T23:33:20.000Z',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.medium.com/v1/me');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer medium-token',
      Accept: 'application/json',
    });

    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe('https://api.medium.com/v1/users/author_123/posts');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer medium-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      title: 'Hello Medium',
      contentFormat: 'markdown',
      content: '# Hello Medium\n\nRelease notes\n\nhttps://sh1pt.com',
      tags: ['launch', 'typescript', 'automation'],
      publishStatus: 'draft',
      canonicalUrl: 'https://example.com/original',
      notifyFollowers: false,
    });
  });

  it('creates publication posts without calling /me when publicationId is configured', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: {
        id: 'pub_post_123',
        url: 'https://medium.com/developers/medium-api-pub_post_123',
      },
    }), { status: 201, headers: { 'content-type': 'application/json' } }));

    const ctx = {
      ...fakeConnectContext({ MEDIUM_INTEGRATION_TOKEN: 'medium-token' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      title: 'Medium API',
      body: 'Draft body',
      hashtags: ['averylongtagnameover25characters', '#medium'],
    }, {
      mode: 'api-legacy',
      publicationId: 'pub_123',
      publishStatus: 'unlisted',
      license: 'cc-40-by',
    });

    expect(result).toMatchObject({
      id: 'pub_post_123',
      url: 'https://medium.com/developers/medium-api-pub_post_123',
      platform: 'medium',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.medium.com/v1/publications/pub_123/posts');
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      tags: ['averylongtagnameover25cha', 'medium'],
      publishStatus: 'unlisted',
      license: 'cc-40-by',
    });
  });

  it('surfaces Medium API errors without leaking the token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      errors: [{ message: 'Invalid token medium-secret-token for user' }],
    }), { status: 401, statusText: 'Unauthorized', headers: { 'content-type': 'application/json' } }));

    const ctx = {
      ...fakeConnectContext({ MEDIUM_INTEGRATION_TOKEN: 'medium-secret-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      title: 'Denied',
      body: 'Body',
    }, { mode: 'api-legacy', authorId: 'author_123' }))
      .rejects.toThrow('Invalid token [redacted] for user');
  });

  it('does not silently fake browser-mode or media uploads', async () => {
    const ctx = {
      ...fakeConnectContext({ MEDIUM_INTEGRATION_TOKEN: 'medium-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      title: 'Browser',
      body: 'Body',
    }, { mode: 'browser' })).rejects.toThrow('browser mode is not implemented');

    await expect(adapter.post(ctx as any, {
      title: 'Image upload',
      body: 'Body',
      media: [{ file: './image.png', kind: 'image' }],
    }, { mode: 'api-legacy' })).rejects.toThrow('media uploads');
  });
});
