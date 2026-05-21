import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: { authorUrn: 'urn:li:person:abc123', visibility: 'PUBLIC' },
  samplePost: { body: 'hello from sh1pt contract tests' },
  requiredSecrets: ['LINKEDIN_ACCESS_TOKEN'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-linkedin posting', () => {
  it('creates a text-only post through the versioned Posts API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', {
      status: 201,
      headers: { 'x-restli-id': 'urn:li:share:6844785523593134080' },
    }));

    const ctx = {
      ...fakeConnectContext({ LINKEDIN_ACCESS_TOKEN: 'linkedin-token' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      body: 'Release shipped',
      link: 'https://sh1pt.com',
      hashtags: ['launch', 'typescript'],
    }, {
      authorUrn: 'urn:li:person:abc123',
      visibility: 'PUBLIC',
      linkedinVersion: '202605',
    });

    expect(result).toEqual({
      id: 'urn:li:share:6844785523593134080',
      url: 'https://www.linkedin.com/feed/update/urn:li:share:6844785523593134080/',
      platform: 'linkedin',
      publishedAt: expect.any(String),
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.linkedin.com/rest/posts');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer linkedin-token',
      'X-Restli-Protocol-Version': '2.0.0',
      'Linkedin-Version': '202605',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      author: 'urn:li:person:abc123',
      commentary: 'Release shipped\n\nhttps://sh1pt.com\n\n#launch #typescript',
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    });
  });

  it('uses the vault author URN, supports reshares, and truncates commentary to the API limit', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', {
      status: 201,
      headers: { 'x-restli-id': 'urn:li:share:6844785523593134081' },
    }));

    const ctx = {
      ...fakeConnectContext({
        LINKEDIN_ACCESS_TOKEN: 'linkedin-token',
        LINKEDIN_AUTHOR_URN: 'urn:li:organization:5515715',
      }),
      dryRun: false,
    };

    await adapter.post(ctx as any, {
      body: 'x'.repeat(3010),
      hashtags: ['ignored'],
    }, {
      visibility: 'CONNECTIONS',
      feedDistribution: 'NONE',
      reshareUrn: 'urn:li:share:6957408550713184256',
      rootReshareUrn: 'urn:li:share:6957408550713184256',
    });

    const payload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(payload.author).toBe('urn:li:organization:5515715');
    expect(payload.commentary).toHaveLength(3000);
    expect(payload.commentary.endsWith('...')).toBe(true);
    expect(payload.visibility).toBe('CONNECTIONS');
    expect(payload.distribution.feedDistribution).toBe('NONE');
    expect(payload.reshareContext).toEqual({
      parent: 'urn:li:share:6957408550713184256',
      root: 'urn:li:share:6957408550713184256',
    });
  });

  it('can fall back to the legacy UGC Posts API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', {
      status: 201,
      headers: { 'x-restli-id': 'urn:li:ugcPost:68447855235931240' },
    }));

    const ctx = {
      ...fakeConnectContext({ LINKEDIN_ACCESS_TOKEN: 'linkedin-token' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, {
      body: 'Legacy share',
    }, {
      api: 'ugc',
      authorUrn: 'urn:li:person:abc123',
      visibility: 'PUBLIC',
    });

    expect(result.id).toBe('urn:li:ugcPost:68447855235931240');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.linkedin.com/v2/ugcPosts');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      author: 'urn:li:person:abc123',
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { attributes: [], text: 'Legacy share' },
          shareMediaCategory: 'NONE',
          media: [],
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    });
  });

  it('surfaces LinkedIn API errors without leaking the access token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      message: 'Bad token linkedin-secret-token',
      status: 401,
    }), { status: 401, statusText: 'Unauthorized', headers: { 'content-type': 'application/json' } }));

    const ctx = {
      ...fakeConnectContext({ LINKEDIN_ACCESS_TOKEN: 'linkedin-secret-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, {
      body: 'Denied',
    }, {
      authorUrn: 'urn:li:person:abc123',
    })).rejects.toThrow('Bad token [redacted]');
  });

  it('does not silently publish without an author or with unimplemented media uploads', async () => {
    const ctx = {
      ...fakeConnectContext({ LINKEDIN_ACCESS_TOKEN: 'linkedin-token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, { body: 'Missing author' }, {}))
      .rejects.toThrow('LINKEDIN_AUTHOR_URN');

    await expect(adapter.post(ctx as any, {
      body: 'Image upload',
      media: [{ file: './image.png', kind: 'image' }],
    }, {
      authorUrn: 'urn:li:person:abc123',
    })).rejects.toThrow('media uploads');
  });
});
