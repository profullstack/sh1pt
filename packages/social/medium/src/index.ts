import { defineSocial, oauthSetup, type SocialPost } from '@profullstack/sh1pt-core';

// Medium — the Medium Integration API is deprecated for new apps
// (as of 2023). Existing integration tokens still work; new accounts
// have no API. Default to browser mode; `apiToken` config enables
// legacy API if a user still has one.
interface Config {
  mode: 'api-legacy' | 'browser';
  authorId?: string;
  publicationId?: string;
  canonicalUrl?: string;
  publishStatus?: 'public' | 'draft' | 'unlisted';
  notifyFollowers?: boolean;
}

interface MediumPostResponse {
  data?: {
    id?: string;
    url?: string;
    publishedAt?: number;
  };
  errors?: Array<{ message?: string }>;
}

export default defineSocial<Config>({
  id: 'social-medium',
  label: 'Medium',
  requires: { maxHashtags: 5, hashtagsInBody: false },
  async connect(ctx, config) {
    if (config.mode === 'api-legacy') {
      if (!ctx.secret('MEDIUM_INTEGRATION_TOKEN')) throw new Error('MEDIUM_INTEGRATION_TOKEN not in vault (legacy-only; new tokens no longer issued)');
    } else {
      if (!ctx.secret('MEDIUM_EMAIL') || !ctx.secret('MEDIUM_PASSWORD')) {
        throw new Error('MEDIUM_EMAIL + MEDIUM_PASSWORD required in vault (browser mode)');
      }
    }
    return { accountId: 'medium' };
  },
  async post(ctx, post, config) {
    if (!post.title) throw new Error('Medium requires a title');
    ctx.log(`medium post · ${config.mode} · "${post.title}"`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://medium.com/', platform: 'medium', publishedAt: new Date().toISOString() };
    if (config.mode !== 'api-legacy') {
      throw new Error('Medium browser mode is not implemented yet; use mode=api-legacy with an existing integration token');
    }

    const token = ctx.secret('MEDIUM_INTEGRATION_TOKEN');
    if (!token) throw new Error('MEDIUM_INTEGRATION_TOKEN not in vault (legacy-only; new tokens no longer issued)');
    const endpoint = mediumPostEndpoint(config);
    const result = await mediumPost(token, endpoint, post, config);
    const created = result.data;
    if (!created?.id || !created.url) throw new Error('Medium post response did not include a post id and URL');

    return {
      id: created.id,
      url: created.url,
      platform: 'medium',
      publishedAt: created.publishedAt ? new Date(created.publishedAt).toISOString() : new Date().toISOString(),
    };
  },

  setup: oauthSetup({
    secretKey: "MEDIUM_ACCESS_TOKEN",
    label: "Medium",
    vendorDocUrl: "https://medium.com/me/settings",
    steps: [
      "Open medium.com/me/settings \u2192 Integration tokens (bottom of page)",
      "Medium disabled new integration tokens for most users \u2014 if unavailable, post via RSS bridge",
      "If you have access: copy the integration token",
    ],
  }),
});

function mediumPostEndpoint(config: Config): string {
  if (config.publicationId) return `https://api.medium.com/v1/publications/${config.publicationId}/posts`;
  if (config.authorId) return `https://api.medium.com/v1/users/${config.authorId}/posts`;
  throw new Error('Medium api-legacy mode requires config.authorId or config.publicationId');
}

async function mediumPost(token: string, endpoint: string, post: SocialPost, config: Config): Promise<MediumPostResponse> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(formatMediumPost(post, config)),
  });
  const data = await readMediumResponse(res);
  if (!res.ok) throw new Error(data.errors?.find((error) => error.message)?.message ?? res.statusText);
  return data;
}

function formatMediumPost(post: SocialPost, config: Config): Record<string, unknown> {
  return {
    title: post.title,
    contentFormat: 'markdown',
    content: post.link ? `${post.body}\n\n${post.link}` : post.body,
    tags: (post.hashtags ?? []).slice(0, 3),
    publishStatus: config.publishStatus ?? 'draft',
    ...(config.canonicalUrl ? { canonicalUrl: config.canonicalUrl } : {}),
    ...(config.notifyFollowers !== undefined ? { notifyFollowers: config.notifyFollowers } : {}),
  };
}

async function readMediumResponse(res: Response): Promise<MediumPostResponse> {
  try {
    return await res.json() as MediumPostResponse;
  } catch {
    return { errors: [{ message: res.statusText }] };
  }
}
