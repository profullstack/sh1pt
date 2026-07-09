import { defineSocial, oauthSetup, type SocialPost } from '@profullstack/sh1pt-core';

const MEDIUM_API_URL = 'https://api.medium.com/v1';
const MEDIUM_TOKEN_SECRET = 'MEDIUM_INTEGRATION_TOKEN';

type PublishStatus = 'public' | 'draft' | 'unlisted';
type MediumLicense =
  | 'all-rights-reserved'
  | 'cc-40-by'
  | 'cc-40-by-sa'
  | 'cc-40-by-nd'
  | 'cc-40-by-nc'
  | 'cc-40-by-nc-nd'
  | 'cc-40-by-nc-sa'
  | 'cc-40-zero'
  | 'public-domain';

// Medium — the Medium Integration API is deprecated for new apps
// (as of 2023). Existing integration tokens still work; new accounts
// have no API. The adapter implements the legacy API path and refuses
// browser mode until a real browser composer exists.
interface Config {
  mode?: 'api-legacy' | 'browser';
  authorId?: string;
  publicationId?: string;
  canonicalUrl?: string;
  publishStatus?: PublishStatus;
  notifyFollowers?: boolean;
  license?: MediumLicense;
}

interface MediumEnvelope<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
  error?: string;
  message?: string;
}

interface MediumUser {
  id?: string;
}

interface MediumPost {
  id?: string;
  url?: string;
  publishedAt?: number | string;
}

export default defineSocial<Config>({
  id: 'social-medium',
  label: 'Medium',
  requires: { maxHashtags: 3, hashtagsInBody: false },
  async connect(ctx, config) {
    if ((config.mode ?? 'api-legacy') === 'api-legacy') {
      if (!ctx.secret(MEDIUM_TOKEN_SECRET)) {
        throw new Error(`${MEDIUM_TOKEN_SECRET} not in vault - run: sh1pt secret set ${MEDIUM_TOKEN_SECRET} <integration-token>`);
      }
      return { accountId: config.publicationId ? `publication:${config.publicationId}` : (config.authorId ?? 'medium') };
    } else {
      throw new Error('Medium browser mode is not implemented yet; use mode=api-legacy with a legacy integration token');
    }
  },
  async post(ctx, post, config) {
    if (!post.title) throw new Error('Medium requires a title');
    if (post.media?.length) throw new Error('Medium media uploads are not implemented yet; use image URLs in markdown content');
    if ((config.mode ?? 'api-legacy') !== 'api-legacy') {
      throw new Error('Medium browser mode is not implemented yet; use mode=api-legacy with a legacy integration token');
    }

    const token = ctx.secret(MEDIUM_TOKEN_SECRET);
    if (!token) throw new Error(`${MEDIUM_TOKEN_SECRET} not in vault - run: sh1pt secret set ${MEDIUM_TOKEN_SECRET} <integration-token>`);
    ctx.log(`medium post · api-legacy · "${post.title}"`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://medium.com/', platform: 'medium', publishedAt: new Date().toISOString() };

    const endpoint = config.publicationId
      ? `/publications/${encodeURIComponent(config.publicationId)}/posts`
      : `/users/${encodeURIComponent(config.authorId ?? await getAuthenticatedUserId(token))}/posts`;

    const payload = await mediumRequest<MediumPost>(token, endpoint, {
      method: 'POST',
      body: JSON.stringify(buildPostPayload(post, config)),
    });
    const published = payload.data;
    if (!published?.id || !published.url) throw new Error('Medium create post response did not include a post id and URL');

    return {
      id: published.id,
      url: published.url,
      platform: 'medium',
      publishedAt: mediumPublishedAt(published),
    };
  },

  setup: oauthSetup({
    secretKey: MEDIUM_TOKEN_SECRET,
    label: "Medium",
    vendorDocUrl: "https://medium.com/me/settings",
    steps: [
      "Open medium.com/me/settings \u2192 Integration tokens (bottom of page)",
      "Medium disabled new integration tokens for most users \u2014 if unavailable, post via RSS bridge",
      "If you have access: copy the integration token",
    ],
  }),
});

async function getAuthenticatedUserId(token: string): Promise<string> {
  const payload = await mediumRequest<MediumUser>(token, '/me', { method: 'GET' });
  const id = payload.data?.id;
  if (!id) throw new Error('Medium /me response did not include the authenticated user id');
  return id;
}

function buildPostPayload(post: SocialPost, config: Config): Record<string, unknown> {
  return {
    title: post.title,
    contentFormat: 'markdown',
    content: buildContentMarkdown(post),
    tags: normalizeMediumTags(post.hashtags),
    publishStatus: config.publishStatus ?? 'draft',
    ...(config.canonicalUrl ? { canonicalUrl: config.canonicalUrl } : {}),
    ...(config.notifyFollowers !== undefined ? { notifyFollowers: config.notifyFollowers } : {}),
    ...(config.license ? { license: config.license } : {}),
  };
}

function buildContentMarkdown(post: SocialPost): string {
  const parts = [`# ${post.title}`, post.body];
  if (post.link) parts.push(post.link);
  return parts.filter(Boolean).join('\n\n');
}

function normalizeMediumTags(tags: string[] = []): string[] {
  return tags
    .map((tag) => tag.replace(/^#/, '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((tag) => tag.slice(0, 25));
}

async function mediumRequest<T>(token: string, path: string, init: RequestInit): Promise<MediumEnvelope<T>> {
  const response = await fetch(`${MEDIUM_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Accept-Charset': 'utf-8',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  const payload = parseMediumJson<T>(text);
  if (!response.ok) {
    throw new Error(redactToken(readMediumError(response, payload, text), token));
  }
  const apiError = payload.errors?.find((error) => error.message)?.message ?? payload.error ?? payload.message;
  if (apiError) throw new Error(redactToken(apiError, token));
  return payload;
}

function parseMediumJson<T>(text: string): MediumEnvelope<T> {
  if (!text) return {};
  try {
    return JSON.parse(text) as MediumEnvelope<T>;
  } catch {
    return { message: text };
  }
}

function readMediumError(response: Response, payload: MediumEnvelope<unknown>, rawText: string): string {
  const apiError = payload.errors?.find((error) => error.message)?.message ?? payload.error ?? payload.message;
  return apiError ?? rawText.slice(0, 300) ?? response.statusText;
}

function redactToken(message: string, token: string): string {
  return message.replaceAll(token, '[redacted]');
}

function mediumPublishedAt(post: MediumPost): string {
  const value = post.publishedAt;
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
}
