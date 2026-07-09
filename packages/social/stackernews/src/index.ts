import { defineSocial, tokenSetup, type SocialPost } from '@profullstack/sh1pt-core';

// Stacker News (stacker.news) — Bitcoin Lightning-themed HN alternative.
// Submissions cost satoshis to post (anti-spam). GraphQL API at
// stacker.news/api/graphql. Auth via cookie-based login or nostr
// NIP-46 — browser-mode is the current practical path.
interface Config {
  mode?: 'api' | 'browser';
  territory?: string;           // e.g. 'bitcoin', 'ai', 'meta'
  cookieKey?: string;
  apiUrl?: string;
}

const DEFAULT_API = 'https://stacker.news/api/graphql';
const DEFAULT_COOKIE_KEY = 'STACKERNEWS_COOKIE';

export default defineSocial<Config>({
  id: 'social-stackernews',
  label: 'Stacker News',
  requires: { maxBodyChars: 20_000, maxHashtags: 3 },
  async connect(ctx) {
    if (!ctx.secret(DEFAULT_COOKIE_KEY)) {
      throw new Error(`${DEFAULT_COOKIE_KEY} not in vault (export cookie from logged-in browser)`);
    }
    return { accountId: 'stackernews' };
  },
  async post(ctx, post, config) {
    if (!post.title) throw new Error('Stacker News requires a title');
    const cookieKey = config.cookieKey ?? DEFAULT_COOKIE_KEY;
    const cookie = ctx.secret(cookieKey);
    if (!cookie) throw new Error(`${cookieKey} not in vault (export cookie from logged-in browser)`);

    ctx.log(`stacker news · territory=${config.territory ?? 'meta'} · note: submissions cost sats`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://stacker.news/', platform: 'stackernews', publishedAt: new Date().toISOString() };

    const payIn = post.link
      ? await upsertLink(ctx, post, config, cookie)
      : await upsertDiscussion(ctx, post, config, cookie);
    const item = payIn.item;
    const id = String(item?.id ?? payIn.id);
    return {
      id,
      url: item?.id ? `https://stacker.news/items/${item.id}` : 'https://stacker.news/',
      platform: 'stackernews',
      publishedAt: new Date(item?.createdAt ?? payIn.createdAt ?? Date.now()).toISOString(),
    };
  },

  setup: tokenSetup({
    secretKey: 'STACKERNEWS_COOKIE',
    label: 'Stacker News',
    vendorDocUrl: 'https://stacker.news/',
    steps: [
      'Sign in at stacker.news in your normal browser',
      'DevTools \u2192 Application \u2192 Cookies \u2192 copy the session cookie value',
      'Paste it below \u2014 submissions still cost sats per the SN model',
    ],
  }),
});

async function upsertLink(
  ctx: { log(m: string): void },
  post: SocialPost,
  config: Config,
  cookie: string,
): Promise<StackerPayIn> {
  const data = await stackerGraphql<{ upsertLink: StackerPayIn }>(config, cookie, {
    query: `
      mutation UpsertStackerNewsLink($subNames: [String!], $title: String!, $url: String!, $text: String) {
        upsertLink(subNames: $subNames, title: $title, url: $url, text: $text) {
          id
          createdAt
          item { id title url createdAt }
        }
      }
    `,
    variables: {
      subNames: [config.territory ?? 'meta'],
      title: post.title,
      url: post.link,
      text: formatText(post),
    },
  });
  ctx.log(`stacker news link submitted · payIn=${data.upsertLink.id}`);
  return data.upsertLink;
}

async function upsertDiscussion(
  ctx: { log(m: string): void },
  post: SocialPost,
  config: Config,
  cookie: string,
): Promise<StackerPayIn> {
  const data = await stackerGraphql<{ upsertDiscussion: StackerPayIn }>(config, cookie, {
    query: `
      mutation UpsertStackerNewsDiscussion($subNames: [String!], $title: String!, $text: String) {
        upsertDiscussion(subNames: $subNames, title: $title, text: $text) {
          id
          createdAt
          item { id title createdAt }
        }
      }
    `,
    variables: {
      subNames: [config.territory ?? 'meta'],
      title: post.title,
      text: formatText(post),
    },
  });
  ctx.log(`stacker news discussion submitted · payIn=${data.upsertDiscussion.id}`);
  return data.upsertDiscussion;
}

async function stackerGraphql<T>(
  config: Config,
  cookie: string,
  body: { query: string; variables: Record<string, unknown> },
): Promise<T> {
  const res = await fetch(config.apiUrl ?? DEFAULT_API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie,
    },
    body: JSON.stringify(body),
  });
  const payload = await readStackerResponse<T>(res);
  if (!res.ok || payload.errors?.length) {
    throw new Error(payload.errors?.map((err) => err.message).join('; ') || `Stacker News API error ${res.status}`);
  }
  if (!payload.data) throw new Error('Stacker News API response did not include data');
  return payload.data;
}

async function readStackerResponse<T>(res: Response): Promise<StackerGraphqlResponse<T>> {
  try {
    return await res.json() as StackerGraphqlResponse<T>;
  } catch {
    return { errors: [{ message: res.statusText }] };
  }
}

function formatText(post: SocialPost): string {
  const tags = (post.hashtags ?? []).slice(0, 3).map((tag) => `#${tag}`).join(' ');
  return [post.body, tags].filter(Boolean).join('\n\n').slice(0, 20_000);
}

interface StackerGraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface StackerPayIn {
  id: number | string;
  createdAt?: string;
  item?: {
    id: number | string;
    title?: string;
    url?: string;
    createdAt?: string;
  } | null;
}
