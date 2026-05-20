import { tokenSetup } from '@profullstack/sh1pt-core';

// Listen Notes - the biggest podcast database with a real API. Use
// this for DISCOVERY (find relevant shows by niche, audience size,
// guest history); send the actual pitch via outreach-cold-email.
interface Config {
  apiKey?: string;
  baseUrl?: string;
  query?: string;
  niche?: string[];
  minListeners?: number;       // Legacy CLI option; Listen Notes does not return listener counts.
  minListenScore?: number;
  language?: string;
  region?: string;
  genreIds?: Array<string | number>;
  onlyIn?: Array<'title' | 'description' | 'author' | 'audio'>;
  pageSize?: number;
  offset?: number;
  type?: 'episode' | 'podcast' | 'curated';
  sortByDate?: boolean;
  safeMode?: boolean;
  uniquePodcasts?: boolean;
  interviewsOnly?: boolean;
  sponsoredOnly?: boolean;
  minAudioLengthMinutes?: number;
  maxAudioLengthMinutes?: number;
  minEpisodes?: number;
  maxEpisodes?: number;
  updateFrequencyMinHours?: number;
  updateFrequencyMaxHours?: number;
  publishedBeforeMs?: number;
  publishedAfterMs?: number;
}

interface SearchContext {
  secret?: (key: string) => string | undefined;
  log(message: string): void;
  dryRun?: boolean;
}

interface SearchResponse {
  next_offset?: number;
  took?: number;
  total?: number;
  count?: number;
  results?: ListenNotesSearchResult[];
  error?: string;
  message?: string;
}

interface ListenNotesSearchResult {
  id?: string;
  rss?: string;
  description?: string;
  description_original?: string;
  title?: string;
  title_original?: string;
  title_highlighted?: string;
  publisher?: string;
  publisher_original?: string;
  publisher_highlighted?: string;
  image?: string;
  thumbnail?: string;
  itunes_id?: number | string;
  latest_episode_id?: string;
  latest_pub_date_ms?: number;
  earliest_pub_date_ms?: number;
  pub_date_ms?: number;
  genre_ids?: number[];
  listennotes_url?: string;
  total_episodes?: number;
  audio_length_sec?: number;
  update_frequency_hours?: number;
  email?: string;
  explicit_content?: boolean;
  website?: string;
  listen_score?: number | string;
  listen_score_global_rank?: string;
  has_guest_interviews?: boolean;
  has_sponsors?: boolean;
  language?: string;
  country?: string;
  podcast?: ListenNotesSearchResult;
}

interface PodcastLead {
  id?: string;
  title?: string;
  publisher?: string;
  description?: string;
  email?: string;
  website?: string;
  rss?: string;
  listenNotesUrl?: string;
  language?: string;
  country?: string;
  totalEpisodes?: number;
  audioLengthSec?: number;
  updateFrequencyHours?: number;
  latestPubDateMs?: number;
  earliestPubDateMs?: number;
  genreIds?: number[];
  image?: string;
  thumbnail?: string;
  listenScore?: number;
  listenScoreGlobalRank?: string;
  hasGuestInterviews?: boolean;
  hasSponsors?: boolean;
  explicitContent?: boolean;
  sourceEpisode?: {
    id?: string;
    title?: string;
    listenNotesUrl?: string;
    publishedAtMs?: number;
  };
}

const API = 'https://listen-api.listennotes.com/api/v2';

export default {
  id: 'outreach-listennotes',
  label: 'Listen Notes (podcast discovery)',

  async connect(ctx: { secret(k: string): string | undefined; log(m: string): void }) {
    if (!ctx.secret('LISTENNOTES_API_KEY')) {
      ctx.log('WARN: LISTENNOTES_API_KEY not in vault; search requires config.apiKey or a vault token');
    }
    return { accountId: 'listennotes' };
  },

  async search(ctx: SearchContext, config: Config) {
    const query = searchQuery(config);
    const type = config.type ?? 'podcast';
    const pageSize = boundedInteger(config.pageSize ?? 10, 1, 10, 'pageSize');
    const apiKey = config.apiKey ?? ctx.secret?.('LISTENNOTES_API_KEY');

    ctx.log(`listennotes search · query="${query}" · type=${type} · pageSize=${pageSize}`);
    if (config.minListeners !== undefined) {
      ctx.log('listennotes search · minListeners ignored because Listen Notes returns listen_score, not listener counts');
    }
    if (ctx.dryRun) {
      return { podcasts: [], total: 0, count: 0, query, dryRun: true };
    }
    if (!apiKey) throw new Error('LISTENNOTES_API_KEY not in vault; pass config.apiKey or store the token');

    const url = new URL(`${(config.baseUrl ?? API).replace(/\/+$/, '')}/search`);
    url.searchParams.set('q', query);
    url.searchParams.set('type', type);
    url.searchParams.set('page_size', String(pageSize));
    addNumber(url, 'offset', config.offset);
    addNumber(url, 'len_min', config.minAudioLengthMinutes);
    addNumber(url, 'len_max', config.maxAudioLengthMinutes);
    addNumber(url, 'episode_count_min', config.minEpisodes);
    addNumber(url, 'episode_count_max', config.maxEpisodes);
    addNumber(url, 'update_freq_min', config.updateFrequencyMinHours);
    addNumber(url, 'update_freq_max', config.updateFrequencyMaxHours);
    addNumber(url, 'published_before', config.publishedBeforeMs);
    addNumber(url, 'published_after', config.publishedAfterMs);
    addString(url, 'language', config.language);
    addString(url, 'region', config.region);
    addList(url, 'genre_ids', config.genreIds);
    addList(url, 'only_in', config.onlyIn);
    addBool(url, 'sort_by_date', config.sortByDate);
    addBool(url, 'safe_mode', config.safeMode);
    addBool(url, 'unique_podcasts', config.uniquePodcasts);
    addBool(url, 'interviews_only', config.interviewsOnly);
    addBool(url, 'sponsored_only', config.sponsoredOnly);

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-ListenAPI-Key': apiKey,
      },
    });
    const data = await readSearchResponse(response);
    if (!response.ok) {
      throw new Error(`Listen Notes search failed: ${response.status} ${errorMessage(data, response.statusText)}`);
    }

    const podcasts = dedupePodcasts((data.results ?? [])
      .map(normalizePodcast)
      .filter((podcast): podcast is PodcastLead => Boolean(podcast))
      .filter((podcast) => config.minListenScore === undefined || (podcast.listenScore ?? 0) >= config.minListenScore));

    return {
      podcasts,
      total: data.total ?? podcasts.length,
      count: data.count ?? podcasts.length,
      nextOffset: data.next_offset,
      took: data.took,
      query,
    };
  },

  setup: tokenSetup({
    secretKey: "LISTENNOTES_API_KEY",
    label: "Listen Notes (podcast discovery)",
    vendorDocUrl: "https://www.listennotes.com/api/",
    steps: [
      "Open listennotes.com/api and sign up for a plan (free tier has limits)",
      "Copy your API key",
    ],
  }),
};

function searchQuery(config: Config): string {
  const query = (config.query ?? config.niche?.filter(Boolean).join(' '))?.trim();
  if (!query) throw new Error('outreach-listennotes requires config.query or at least one config.niche value');
  return query;
}

function boundedInteger(value: number, min: number, max: number, name: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`outreach-listennotes ${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function addString(url: URL, key: string, value?: string): void {
  if (value) url.searchParams.set(key, value);
}

function addNumber(url: URL, key: string, value?: number): void {
  if (value !== undefined) url.searchParams.set(key, String(value));
}

function addBool(url: URL, key: string, value?: boolean): void {
  if (value !== undefined) url.searchParams.set(key, value ? '1' : '0');
}

function addList(url: URL, key: string, value?: Array<string | number>): void {
  if (value?.length) url.searchParams.set(key, value.join(','));
}

async function readSearchResponse(response: Response): Promise<SearchResponse> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as SearchResponse;
  } catch {
    return { message: text };
  }
}

function errorMessage(data: SearchResponse, fallback: string): string {
  return data.error ?? data.message ?? fallback;
}

function normalizePodcast(result: ListenNotesSearchResult): PodcastLead | undefined {
  const podcast = result.podcast ?? result;
  const id = podcast.id;
  const title = plainText(podcast.title ?? podcast.title_original ?? podcast.title_highlighted);
  if (!id && !title) return undefined;

  return stripUndefined({
    id,
    title,
    publisher: plainText(podcast.publisher ?? podcast.publisher_original ?? podcast.publisher_highlighted),
    description: plainText(podcast.description ?? podcast.description_original),
    email: podcast.email,
    website: podcast.website,
    rss: podcast.rss ?? result.rss,
    listenNotesUrl: podcast.listennotes_url,
    language: podcast.language,
    country: podcast.country,
    totalEpisodes: podcast.total_episodes,
    audioLengthSec: podcast.audio_length_sec,
    updateFrequencyHours: podcast.update_frequency_hours,
    latestPubDateMs: podcast.latest_pub_date_ms,
    earliestPubDateMs: podcast.earliest_pub_date_ms,
    genreIds: podcast.genre_ids,
    image: podcast.image,
    thumbnail: podcast.thumbnail,
    listenScore: numberValue(podcast.listen_score),
    listenScoreGlobalRank: podcast.listen_score_global_rank,
    hasGuestInterviews: podcast.has_guest_interviews,
    hasSponsors: podcast.has_sponsors,
    explicitContent: podcast.explicit_content,
    sourceEpisode: result.podcast ? stripUndefined({
      id: result.id,
      title: plainText(result.title ?? result.title_original ?? result.title_highlighted),
      listenNotesUrl: result.listennotes_url,
      publishedAtMs: result.pub_date_ms,
    }) : undefined,
  });
}

function dedupePodcasts(podcasts: PodcastLead[]): PodcastLead[] {
  const seen = new Set<string>();
  return podcasts.filter((podcast) => {
    const key = podcast.id ?? podcast.listenNotesUrl ?? podcast.title;
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function plainText(value?: string): string | undefined {
  return value?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || undefined;
}

function numberValue(value?: number | string): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  return undefined;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
