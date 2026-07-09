import { defineSocial, oauthSetup, type SocialPost } from '@profullstack/sh1pt-core';

// Tumblr API v2. OAuth 1.0a (legacy) or OAuth 2.0 via the newer endpoints.
// Posts are typed (text / photo / video / link / quote / chat / audio).
interface Config {
  blogIdentifier: string;
  state?: 'published' | 'draft' | 'queue' | 'private';
  publishOn?: string;
  slug?: string;
  sourceUrl?: string;
}

interface TumblrPostResponse {
  meta?: {
    status?: number;
    msg?: string;
  };
  response?: {
    id?: string;
  };
  errors?: Array<{
    title?: string;
    detail?: string;
    code?: number;
  }>;
}

export default defineSocial<Config>({
  id: 'social-tumblr',
  label: 'Tumblr',
  requires: { maxBodyChars: 4096, maxHashtags: 30, hashtagsInBody: false },

  async connect(ctx, config) {
    if (!ctx.secret('TUMBLR_ACCESS_TOKEN')) throw new Error('TUMBLR_ACCESS_TOKEN not in vault');
    return { accountId: config.blogIdentifier };
  },

  async post(ctx, post, config) {
    const token = ctx.secret('TUMBLR_ACCESS_TOKEN');
    if (!token) throw new Error('TUMBLR_ACCESS_TOKEN not in vault');
    ctx.log(`tumblr post · blog=${config.blogIdentifier} · ${post.body.length} chars`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://tumblr.com/', platform: 'tumblr', publishedAt: new Date().toISOString() };

    const res = await fetch(`https://api.tumblr.com/v2/blog/${encodeURIComponent(config.blogIdentifier)}/posts`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'user-agent': '@profullstack/sh1pt-social-tumblr',
      },
      body: JSON.stringify(formatTumblrPost(post, config)),
    });
    const data = await readTumblrResponse(res);
    if (!res.ok) throw new Error(tumblrErrorMessage(data, res.statusText));

    const id = data.response?.id;
    if (!id) throw new Error('Tumblr create post response did not include a post id');
    return {
      id,
      url: postUrl(config.blogIdentifier, id),
      platform: 'tumblr',
      publishedAt: (post.schedule ?? new Date()).toISOString(),
    };
  },

  setup: oauthSetup({
    secretKey: 'TUMBLR_ACCESS_TOKEN',
    label: 'Tumblr',
    vendorDocUrl: 'https://www.tumblr.com/docs/en/api/v2',
    steps: [
      'Open tumblr.com/oauth/apps → Register application',
      'Set default callback URL to http://127.0.0.1:8765/callback and request scopes: write, basic',
      'Run OAuth 2.0 authorization-code flow and paste the access token',
    ],
    ...(process.env.SH1PT_TUMBLR_CLIENT_ID
      ? {
          loopback: {
            clientId: process.env.SH1PT_TUMBLR_CLIENT_ID,
            authUrl: 'https://www.tumblr.com/oauth2/authorize',
            tokenUrl: 'https://api.tumblr.com/v2/oauth2/token',
            scopes: ['write', 'basic'],
          },
        }
      : {}),
  }),
});

type TumblrContentBlock =
  | { type: 'text'; text: string; subtype?: 'heading1' }
  | { type: 'link'; url: string };

function formatTumblrPost(post: SocialPost, config: Config): Record<string, unknown> {
  const scheduled = post.schedule?.toISOString();
  return {
    content: formatContent(post),
    state: scheduled ? 'queue' : config.state,
    publish_on: scheduled ?? config.publishOn,
    tags: (post.hashtags ?? []).slice(0, 30).join(','),
    source_url: config.sourceUrl,
    slug: config.slug,
  };
}

function formatContent(post: SocialPost): TumblrContentBlock[] {
  const blocks: TumblrContentBlock[] = [];
  if (post.title) blocks.push({ type: 'text', subtype: 'heading1', text: post.title });
  for (const text of post.body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)) {
    blocks.push({ type: 'text', text });
  }
  if (post.link) blocks.push({ type: 'link', url: post.link });
  return blocks;
}

async function readTumblrResponse(res: Response): Promise<TumblrPostResponse> {
  try {
    return await res.json() as TumblrPostResponse;
  } catch {
    return { meta: { status: res.status, msg: res.statusText } };
  }
}

function tumblrErrorMessage(data: TumblrPostResponse, fallback: string): string {
  const firstError = data.errors?.[0];
  if (firstError?.detail) return firstError.detail;
  if (firstError?.title) return firstError.title;
  return data.meta?.msg ?? fallback;
}

function postUrl(blogIdentifier: string, id: string): string {
  const cleaned = blogIdentifier.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (cleaned.startsWith('t:')) return 'https://www.tumblr.com/';
  if (cleaned.includes('.')) return `https://${cleaned}/post/${id}`;
  return `https://www.tumblr.com/${cleaned}/${id}`;
}
