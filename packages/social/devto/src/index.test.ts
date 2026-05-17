import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: { published: false },
  samplePost: { title: 'Hello DEV', body: 'hello from sh1pt contract tests' },
  requiredSecrets: ['DEVTO_API_KEY'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-devto posting', () => {
  it('creates a DEV article with the API key header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 251,
        url: 'https://dev.to/sh1pt/release-shipped',
        published_at: '2026-05-11T20:00:00Z',
      }),
    } as any);

    const ctx = {
      ...fakeConnectContext({ DEVTO_API_KEY: 'dev-key' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      title: 'Release shipped',
      body: 'Article body',
      hashtags: ['devto', 'api', 'typescript', 'automation', 'ignored'],
      link: 'https://sh1pt.com',
    }, { published: true, canonicalUrl: 'https://example.com/source', organizationId: 123 });

    expect(result).toEqual({
      id: '251',
      url: 'https://dev.to/sh1pt/release-shipped',
      platform: 'devto',
      publishedAt: '2026-05-11T20:00:00.000Z',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://dev.to/api/articles');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      'api-key': 'dev-key',
      'content-type': 'application/json',
    });
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      article: {
        title: 'Release shipped',
        body_markdown: 'Article body\n\nhttps://sh1pt.com',
        published: true,
        tags: ['devto', 'api', 'typescript', 'automation'],
        canonical_url: 'https://example.com/source',
        organization_id: 123,
      },
    });
  });

  it('throws DEV API error messages when article creation fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      text: async () => JSON.stringify({ errors: ['Title has already been taken'] }),
    } as any);

    const ctx = {
      ...fakeConnectContext({ DEVTO_API_KEY: 'dev-key' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, { title: 'Release shipped', body: 'Article body' }, {}))
      .rejects.toThrow('Title has already been taken');
  });
});
