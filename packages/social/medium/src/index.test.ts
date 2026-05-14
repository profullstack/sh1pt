import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: { mode: 'api-legacy', authorId: 'user_123' },
  samplePost: { title: 'Hello Medium', body: 'hello from sh1pt contract tests' },
  requiredSecrets: ['MEDIUM_INTEGRATION_TOKEN'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-medium legacy API posting', () => {
  it('creates a draft post for a Medium user', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: 'post_123',
          url: 'https://medium.com/@sh1pt/release-shipped',
          publishedAt: 1778683200000,
        },
      }),
    } as any);

    const result = await adapter.post(ctx(), {
      title: 'Release shipped',
      body: 'Article body',
      hashtags: ['startup', 'launch', 'automation', 'ignored'],
      link: 'https://sh1pt.com',
    }, {
      mode: 'api-legacy',
      authorId: 'user_123',
      canonicalUrl: 'https://example.com/release-shipped',
      publishStatus: 'draft',
      notifyFollowers: false,
    });

    expect(result).toEqual({
      id: 'post_123',
      url: 'https://medium.com/@sh1pt/release-shipped',
      platform: 'medium',
      publishedAt: '2026-05-13T14:40:00.000Z',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.medium.com/v1/users/user_123/posts');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer medium-token',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      title: 'Release shipped',
      contentFormat: 'markdown',
      content: 'Article body\n\nhttps://sh1pt.com',
      tags: ['startup', 'launch', 'automation'],
      publishStatus: 'draft',
      canonicalUrl: 'https://example.com/release-shipped',
      notifyFollowers: false,
    });
  });

  it('creates publication posts when publicationId is configured', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: 'post_pub',
          url: 'https://medium.com/sh1pt/release-shipped',
        },
      }),
    } as any);

    await adapter.post(ctx(), {
      title: 'Release shipped',
      body: 'Article body',
    }, {
      mode: 'api-legacy',
      publicationId: 'publication_123',
    });

    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.medium.com/v1/publications/publication_123/posts');
  });

  it('requires an author or publication id for legacy API posting', async () => {
    await expect(adapter.post(ctx(), {
      title: 'Release shipped',
      body: 'Article body',
    }, {
      mode: 'api-legacy',
    })).rejects.toThrow('config.authorId or config.publicationId');
  });

  it('surfaces Medium API error messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ errors: [{ message: 'Token was revoked' }] }),
    } as any);

    await expect(adapter.post(ctx(), {
      title: 'Release shipped',
      body: 'Article body',
    }, {
      mode: 'api-legacy',
      authorId: 'user_123',
    })).rejects.toThrow('Token was revoked');
  });
});

function ctx() {
  return {
    ...fakeConnectContext({ MEDIUM_INTEGRATION_TOKEN: 'medium-token' }),
    dryRun: false,
  } as any;
}
