import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: {},
  samplePost: { body: 'hello from sh1pt contract tests' },
  requiredSecrets: ['UGIG_API_KEY'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-ugig', () => {
  it('checks the current uGig profile endpoint with an API key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ profile: { id: 'profile-1', username: 'sh1pt' } }),
    } as Response);

    const result = await adapter.connect(fakeConnectContext({ UGIG_API_KEY: 'ugig-key' }) as any, {});

    expect(result).toEqual({ accountId: 'sh1pt' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://ugig.net/api/profile');
    expect((init as RequestInit).headers).toMatchObject({ 'X-API-Key': 'ugig-key' });
  });

  it('creates a community post through the current uGig posts API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        post: {
          id: '7db0a088-8639-4054-b960-245b0237b2b3',
          created_at: '2026-05-13T10:00:00Z',
        },
      }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ UGIG_API_KEY: 'ugig-key' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      title: 'Release shipped',
      body: 'The adapter now uses the documented uGig API.',
      hashtags: ['#ai', 'typescript', 'automation', 'this-tag-name-is-longer-than-fifty-characters-and-gets-truncated', 'ignored-1', 'ignored-2', 'ignored-3', 'ignored-4', 'ignored-5', 'ignored-6', 'ignored-7'],
      link: 'https://sh1pt.com',
    }, {});

    expect(result).toEqual({
      id: '7db0a088-8639-4054-b960-245b0237b2b3',
      url: 'https://ugig.net/post/7db0a088-8639-4054-b960-245b0237b2b3',
      platform: 'ugig',
      publishedAt: '2026-05-13T10:00:00.000Z',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://ugig.net/api/posts');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      'X-API-Key': 'ugig-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      content: 'Release shipped\n\nThe adapter now uses the documented uGig API.',
      url: 'https://sh1pt.com',
      post_type: 'link',
      tags: [
        'ai',
        'typescript',
        'automation',
        'this-tag-name-is-longer-than-fifty-characters-and-',
        'ignored-1',
        'ignored-2',
        'ignored-3',
        'ignored-4',
        'ignored-5',
        'ignored-6',
      ],
    });
  });

  it('falls back to bearer-token auth for existing UGIG_TOKEN users', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ post: { id: '4ac04e00-a2c6-468b-9316-6d5bcec9c161' } }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ UGIG_TOKEN: 'legacy-token' }),
      dryRun: false,
    };

    await adapter.post(ctx as any, { body: 'Legacy token post' }, { postType: 'showcase' });

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer legacy-token',
    });
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      content: 'Legacy token post',
      url: null,
      post_type: 'showcase',
    });
  });

  it('surfaces uGig API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => JSON.stringify({ error: 'content is required' }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ UGIG_API_KEY: 'ugig-key' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, { body: 'bad post' }, {}))
      .rejects.toThrow('ugig post failed: HTTP 400 - content is required');
  });
});
