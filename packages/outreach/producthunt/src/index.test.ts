import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'outreach' });

const ctx = (
  secrets: Record<string, string> = { PRODUCTHUNT_API_TOKEN: 'test-token' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: vi.fn(),
  dryRun,
});

describe('outreach-producthunt GraphQL discovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a Product Hunt API token for live API access', async () => {
    await expect(adapter.connect(ctx({}), {})).rejects.toThrow('PRODUCTHUNT_API_TOKEN');
    await expect(adapter.search(ctx({}), { topic: 'developer-tools' })).rejects.toThrow('PRODUCTHUNT_API_TOKEN');
  });

  it('keeps dry-run post search side-effect free', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.search(ctx({}, true), { topic: 'developer-tools', first: 5 }))
      .resolves.toEqual({ posts: [], totalCount: 0, dryRun: true });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('queries Product Hunt posts with public GraphQL filters', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _request?: RequestInit) => new Response(JSON.stringify({
      data: {
        posts: {
          totalCount: 1,
          pageInfo: {
            hasNextPage: false,
            endCursor: 'cursor-1',
          },
          nodes: [{
            id: 'post-1',
            name: 'Launch Compass',
            slug: 'launch-compass',
            tagline: 'Plan launches without chaos',
            description: 'Launch prep for small teams.',
            url: 'https://www.producthunt.com/posts/launch-compass',
            website: 'https://example.com',
            votesCount: 42,
            commentsCount: 7,
            reviewsCount: 3,
            reviewsRating: 4.7,
            dailyRank: 5,
            featuredAt: '2026-05-20T12:00:00Z',
            createdAt: '2026-05-20T08:00:00Z',
            scheduledAt: null,
            thumbnail: { url: 'https://example.com/thumb.png' },
            topics: { nodes: [{ name: 'Developer Tools', slug: 'developer-tools' }] },
            makers: [{ username: 'ada', name: 'Ada Lovelace' }],
          }],
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.search(ctx(), {
      topic: 'developer-tools',
      first: 10,
      featured: true,
      postedAfter: '2026-05-01T00:00:00Z',
      order: 'RANKING',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.producthunt.com/v2/api/graphql');
    expect(request).toBeDefined();
    expect(request!.headers).toMatchObject({
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    const body = JSON.parse(request!.body as string);
    expect(body.variables).toEqual({
      first: 10,
      topic: 'developer-tools',
      featured: true,
      postedAfter: '2026-05-01T00:00:00Z',
      order: 'RANKING',
    });
    expect(body.query).toContain('posts(');
    expect(result).toEqual({
      posts: [{
        id: 'post-1',
        name: 'Launch Compass',
        slug: 'launch-compass',
        tagline: 'Plan launches without chaos',
        description: 'Launch prep for small teams.',
        url: 'https://www.producthunt.com/posts/launch-compass',
        website: 'https://example.com',
        votesCount: 42,
        commentsCount: 7,
        reviewsCount: 3,
        reviewsRating: 4.7,
        dailyRank: 5,
        featuredAt: '2026-05-20T12:00:00Z',
        createdAt: '2026-05-20T08:00:00Z',
        thumbnailUrl: 'https://example.com/thumb.png',
        topics: [{ name: 'Developer Tools', slug: 'developer-tools' }],
        makers: [{ username: 'ada', name: 'Ada Lovelace' }],
      }],
      totalCount: 1,
      pageInfo: {
        hasNextPage: false,
        endCursor: 'cursor-1',
      },
    });
  });

  it('looks up a Product Hunt post by slug', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: {
        post: {
          id: 'post-2',
          name: 'Proof Board',
          slug: 'proof-board',
          tagline: 'Proof packets for launch teams',
          url: 'https://www.producthunt.com/posts/proof-board',
          votesCount: 9,
          commentsCount: 1,
          createdAt: '2026-05-19T08:00:00Z',
        },
      },
    }), { status: 200 })));

    await expect(adapter.lookup(ctx(), { productSlug: 'proof-board' })).resolves.toEqual({
      post: {
        id: 'post-2',
        name: 'Proof Board',
        slug: 'proof-board',
        tagline: 'Proof packets for launch teams',
        url: 'https://www.producthunt.com/posts/proof-board',
        votesCount: 9,
        commentsCount: 1,
        createdAt: '2026-05-19T08:00:00Z',
        topics: [],
        makers: [],
      },
    });
  });

  it('surfaces Product Hunt GraphQL errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      errors: [{ message: 'Field does not exist' }],
    }), { status: 200 })));

    await expect(adapter.search(ctx(), { topic: 'developer-tools' }))
      .rejects.toThrow('Product Hunt API error: Field does not exist');
  });

  it('does not fake live launch submissions through the public API', async () => {
    await expect(adapter.launch(ctx(), { productSlug: 'launch-compass' }))
      .rejects.toThrow('browser review');

    await expect(adapter.launch(ctx({}, true), {
      productSlug: 'launch-compass',
      tagline: 'Plan launches without chaos',
      topics: ['developer-tools'],
      makers: ['ada'],
      galleryImages: ['hero.png'],
      firstComment: 'Happy to answer questions.',
    })).resolves.toMatchObject({
      id: 'dry-run',
      url: 'https://www.producthunt.com/posts/launch-compass',
      checklist: expect.arrayContaining([
        'Slug: launch-compass',
        'Tagline: Plan launches without chaos',
        'Topics: developer-tools',
        'Makers: ada',
        'Gallery images: 1',
        'First comment: ready',
      ]),
    });
  });

  it('validates page size and lookup input', async () => {
    await expect(adapter.search(ctx(), { first: 0 })).rejects.toThrow('first');
    await expect(adapter.search(ctx(), { first: 51 })).rejects.toThrow('first');
    await expect(adapter.lookup(ctx(), {})).rejects.toThrow('productSlug');
  });
});
