import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: { published: false },
  samplePost: { title: 'Hello CodeNewbie', body: 'hello from sh1pt contract tests' },
  requiredSecrets: ['CODENEWBIE_API_KEY'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-codenewbie posting', () => {
  it('creates a CodeNewbie article using the Forem API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 414,
        url: 'https://community.codenewbie.org/sh1pt/release-notes',
        published_at: '2026-05-11T20:00:00Z',
      }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ CODENEWBIE_API_KEY: 'codenewbie-key' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      title: 'Release notes',
      body: 'Article body',
      hashtags: ['webdev', 'beginners', 'api', 'typescript', 'ignored'],
      link: 'https://sh1pt.com',
    }, { published: true, canonicalUrl: 'https://example.com/source' });

    expect(result).toEqual({
      id: '414',
      url: 'https://community.codenewbie.org/sh1pt/release-notes',
      platform: 'codenewbie',
      publishedAt: '2026-05-11T20:00:00.000Z',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://community.codenewbie.org/api/articles');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      'api-key': 'codenewbie-key',
      'content-type': 'application/json',
    });
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      article: {
        title: 'Release notes',
        body_markdown: 'Article body\n\nhttps://sh1pt.com',
        published: true,
        tags: ['webdev', 'beginners', 'api', 'typescript'],
        canonical_url: 'https://example.com/source',
      },
    });
  });

  it('throws CodeNewbie API error messages when article creation fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      text: async () => JSON.stringify({ errors: ['Body markdown is too short'] }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ CODENEWBIE_API_KEY: 'codenewbie-key' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      title: 'Release notes',
      body: 'Short',
    }, {})).rejects.toThrow('Body markdown is too short');
  });
});
