import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: { host: 'community.codenewbie.org', published: false },
  samplePost: { title: 'Hello Forem', body: 'hello from sh1pt contract tests' },
  requiredSecrets: ['FOREM_API_KEY_COMMUNITY_CODENEWBIE_ORG'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-forem posting', () => {
  it('creates an article on the configured Forem host', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 313,
        url: 'https://community.codenewbie.org/sh1pt/release-notes',
        published_at: '2026-05-11T20:00:00Z',
      }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ FOREM_API_KEY_COMMUNITY_CODENEWBIE_ORG: 'forem-key' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      title: 'Release notes',
      body: 'Article body',
      hashtags: ['forem', 'api', 'typescript', 'automation', 'ignored'],
      link: 'https://sh1pt.com',
    }, {
      host: 'https://community.codenewbie.org/',
      published: true,
      canonicalUrl: 'https://example.com/source',
      organizationId: 123,
    });

    expect(result).toEqual({
      id: '313',
      url: 'https://community.codenewbie.org/sh1pt/release-notes',
      platform: 'forem',
      publishedAt: '2026-05-11T20:00:00.000Z',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://community.codenewbie.org/api/articles');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      'api-key': 'forem-key',
      'content-type': 'application/json',
    });
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      article: {
        title: 'Release notes',
        body_markdown: 'Article body\n\nhttps://sh1pt.com',
        published: true,
        tags: ['forem', 'api', 'typescript', 'automation'],
        canonical_url: 'https://example.com/source',
        organization_id: 123,
      },
    });
  });

  it('throws Forem API error messages when article creation fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      text: async () => JSON.stringify({ errors: ['Title has already been taken'] }),
    } as Response);

    const ctx = {
      ...fakeConnectContext({ FOREM_API_KEY_COMMUNITY_CODENEWBIE_ORG: 'forem-key' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      title: 'Release notes',
      body: 'Article body',
    }, { host: 'community.codenewbie.org' })).rejects.toThrow('Title has already been taken');
  });
});
