import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial } from '@profullstack/sh1pt-core/testing';
import social from './index.js';

contractTestSocial(social, {
  sampleConfig: { publicationId: 'pub_123' },
  samplePost: { title: 'Hello Hashnode', body: 'hello from sh1pt contract tests' },
  requiredSecrets: ['HASHNODE_API_TOKEN'],
});

describe('Hashnode publishPost integration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('publishes markdown through Hashnode GraphQL and returns the published post URL', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        data: {
          publishPost: {
            post: {
              id: 'post_123',
              url: 'https://hashnode.com/post/ship-it',
            },
          },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const result = await social.post({
      secret: (key) => key === 'HASHNODE_API_TOKEN' ? 'token_123' : undefined,
      log: () => {},
      dryRun: false,
    }, {
      title: 'Ship it',
      body: 'Release notes go here.',
      link: 'https://example.com/release',
    }, {
      publicationId: 'pub_123',
      tags: ['tag_1'],
      canonicalUrl: 'https://example.com/original',
    });

    expect(result).toEqual({
      id: 'post_123',
      url: 'https://hashnode.com/post/ship-it',
      platform: 'hashnode',
      publishedAt: expect.any(String),
    });
    expect(calls).toHaveLength(1);
    const [request] = calls;
    expect(request!.url).toBe('https://gql.hashnode.com');
    expect(request!.init.method).toBe('POST');
    expect(request!.init.headers).toMatchObject({
      Authorization: 'Bearer token_123',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });

    const payload = JSON.parse(request!.init.body as string);
    expect(payload.query).toContain('mutation PublishPost');
    expect(payload.variables.input).toEqual({
      publicationId: 'pub_123',
      title: 'Ship it',
      contentMarkdown: 'Release notes go here.\n\nhttps://example.com/release',
      tags: ['tag_1'],
      canonicalUrl: 'https://example.com/original',
    });
  });

  it('surfaces GraphQL errors with the Hashnode message', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      errors: [{ message: 'Publication not found' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await expect(social.post({
      secret: (key) => key === 'HASHNODE_API_TOKEN' ? 'token_123' : undefined,
      log: () => {},
      dryRun: false,
    }, {
      title: 'Missing blog',
      body: 'Body',
    }, {
      publicationId: 'missing',
    })).rejects.toThrow('Publication not found');
  });
});
