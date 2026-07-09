import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'outreach' });

const ctx = (secrets: Record<string, string> = { LISTENNOTES_API_KEY: 'test-listennotes-key' }, dryRun = false) => ({
  secret: (key: string) => secrets[key],
  log: vi.fn(),
  dryRun,
});

describe('outreach-listennotes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps dry-run search side-effect free', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.search(ctx({}, true), {
      niche: ['founder', 'devtools'],
      pageSize: 5,
    })).resolves.toEqual({
      podcasts: [],
      total: 0,
      count: 0,
      query: 'founder devtools',
      dryRun: true,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('searches podcasts through the Listen Notes API', async () => {
    const fetchMock = vi.fn(async (_url: URL | string, _init?: RequestInit) => new Response(JSON.stringify({
      next_offset: 10,
      took: 0.12,
      total: 123,
      count: 2,
      results: [
        {
          id: 'podcast_a',
          title_original: 'Applied Shipping',
          publisher_original: 'Ada Labs',
          description_original: 'A show about shipping products.',
          email: 'host@example.com',
          website: 'https://example.com',
          rss: 'https://example.com/rss.xml',
          listennotes_url: 'https://www.listennotes.com/podcasts/applied-shipping',
          language: 'English',
          country: 'us',
          total_episodes: 42,
          listen_score: '61',
          listen_score_global_rank: '1%',
          has_guest_interviews: true,
          has_sponsors: false,
          explicit_content: false,
        },
        {
          id: 'podcast_low_score',
          title_original: 'Tiny Launch Notes',
          listen_score: 12,
        },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.search(ctx(), {
      query: 'developer tools',
      language: 'English',
      region: 'us',
      genreIds: [93, '127'],
      onlyIn: ['title', 'description'],
      pageSize: 10,
      offset: 0,
      safeMode: true,
      sortByDate: false,
      minListenScore: 50,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0]!;
    const parsed = new URL(String(url));
    expect(parsed.toString()).toContain('https://listen-api.listennotes.com/api/v2/search?');
    expect(parsed.searchParams.get('q')).toBe('developer tools');
    expect(parsed.searchParams.get('type')).toBe('podcast');
    expect(parsed.searchParams.get('page_size')).toBe('10');
    expect(parsed.searchParams.get('language')).toBe('English');
    expect(parsed.searchParams.get('region')).toBe('us');
    expect(parsed.searchParams.get('genre_ids')).toBe('93,127');
    expect(parsed.searchParams.get('only_in')).toBe('title,description');
    expect(parsed.searchParams.get('safe_mode')).toBe('1');
    expect(parsed.searchParams.get('sort_by_date')).toBe('0');
    expect(request).toMatchObject({
      headers: {
        Accept: 'application/json',
        'X-ListenAPI-Key': 'test-listennotes-key',
      },
    });
    expect(result).toEqual({
      podcasts: [{
        id: 'podcast_a',
        title: 'Applied Shipping',
        publisher: 'Ada Labs',
        description: 'A show about shipping products.',
        email: 'host@example.com',
        website: 'https://example.com',
        rss: 'https://example.com/rss.xml',
        listenNotesUrl: 'https://www.listennotes.com/podcasts/applied-shipping',
        language: 'English',
        country: 'us',
        totalEpisodes: 42,
        listenScore: 61,
        listenScoreGlobalRank: '1%',
        hasGuestInterviews: true,
        hasSponsors: false,
        explicitContent: false,
      }],
      total: 123,
      count: 2,
      nextOffset: 10,
      took: 0.12,
      query: 'developer tools',
    });
  });

  it('normalizes episode search results back to their podcasts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      results: [
        {
          id: 'episode_a',
          title_original: 'Founders and AI Tools',
          listennotes_url: 'https://www.listennotes.com/e/episode-a',
          pub_date_ms: 1700000000000,
          rss: 'https://nested.example/rss.xml',
          podcast: {
            id: 'podcast_nested',
            title_highlighted: '<span class="ln-search-highlight">AI</span> Builders',
            publisher_original: 'Grace Media',
            listennotes_url: 'https://www.listennotes.com/podcasts/ai-builders',
            listen_score: 55,
          },
        },
        {
          id: 'episode_b',
          podcast: {
            id: 'podcast_nested',
            title_original: 'AI Builders',
          },
        },
      ],
    }), { status: 200 })));

    await expect(adapter.search(ctx(), {
      query: 'ai founders',
      type: 'episode',
      uniquePodcasts: true,
    })).resolves.toMatchObject({
      podcasts: [{
        id: 'podcast_nested',
        title: 'AI Builders',
        publisher: 'Grace Media',
        rss: 'https://nested.example/rss.xml',
        listenNotesUrl: 'https://www.listennotes.com/podcasts/ai-builders',
        listenScore: 55,
        sourceEpisode: {
          id: 'episode_a',
          title: 'Founders and AI Tools',
          listenNotesUrl: 'https://www.listennotes.com/e/episode-a',
          publishedAtMs: 1700000000000,
        },
      }],
      query: 'ai founders',
    });
  });

  it('requires a key for live searches', async () => {
    await expect(adapter.search(ctx({}, false), {
      query: 'developer tools',
    })).rejects.toThrow('LISTENNOTES_API_KEY');
  });

  it('surfaces Listen Notes API errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'Invalid API key',
    }), { status: 401, statusText: 'Unauthorized' })));

    await expect(adapter.search(ctx(), {
      query: 'developer tools',
    })).rejects.toThrow('Listen Notes search failed: 401 Invalid API key');
  });

  it('validates required search input and Listen Notes page size limits', async () => {
    await expect(adapter.search(ctx(), {})).rejects.toThrow('config.query');
    await expect(adapter.search(ctx(), { query: 'ai', pageSize: 11 })).rejects.toThrow('pageSize');
  });
});
