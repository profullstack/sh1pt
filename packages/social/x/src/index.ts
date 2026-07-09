import { defineSocial, adaptPost, cookieSetup } from '@profullstack/sh1pt-core';

// X (Twitter). OAuth 1.0a or OAuth 2.0; tweet-create endpoint lives at
// api.twitter.com/2/tweets. The v2 free tier shipped with a very low
// post limit and paid tiers are expensive — browser-mode fallback via
// Playwright is a common alternative for heavy organic posting.
interface Config {
  mode: 'api' | 'browser';
  username?: string;           // for browser mode
  captchaSolver?: 'captcha-2captcha' | 'captcha-solver';
  mediaIds?: string[];
  replyToPostId?: string;
  quotePostId?: string;
  apiBaseUrl?: string;
}

interface XCreatePostResponse {
  data?: {
    id?: string;
    text?: string;
  };
  errors?: Array<{
    title?: string;
    detail?: string;
  }>;
}

export default defineSocial<Config>({
  id: 'social-x',
  label: 'X (Twitter)',
  requires: { maxBodyChars: 280, maxHashtags: 10, hashtagsInBody: true },

  async connect(ctx, config) {
    if (config.mode === 'api' && !ctx.secret('X_BEARER_TOKEN')) {
      throw new Error('X_BEARER_TOKEN not in vault — `sh1pt secret set X_BEARER_TOKEN`');
    }
    if (config.mode === 'browser' && (!ctx.secret('X_EMAIL') || !ctx.secret('X_PASSWORD'))) {
      throw new Error('browser mode needs X_EMAIL + X_PASSWORD in vault');
    }
    return { accountId: config.username ?? 'x' };
  },

  async post(ctx, post, config) {
    const { body } = adaptPost(post, {
      id: 'social-x', label: 'X', requires: { maxBodyChars: 280, maxHashtags: 10, hashtagsInBody: true },
    } as any);
    ctx.log(`x post · ${body.length} chars · media=${post.media?.length ?? 0}`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://x.com/', platform: 'x', publishedAt: new Date().toISOString() };

    if (config.mode !== 'api') {
      throw new Error('social-x browser mode is not implemented yet; use mode=api with X_BEARER_TOKEN');
    }
    const token = ctx.secret('X_BEARER_TOKEN');
    if (!token) throw new Error('X_BEARER_TOKEN not in vault — `sh1pt secret set X_BEARER_TOKEN`');
    if (post.media?.length && !config.mediaIds?.length) {
      throw new Error('X media posts require pre-uploaded media IDs in config.mediaIds');
    }

    const res = await fetch(`${config.apiBaseUrl ?? 'https://api.x.com'}/2/tweets`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(formatXPost(body, config)),
    });
    const data = await readXResponse(res);
    if (!res.ok) throw new Error(xErrorMessage(data, res.statusText));
    const id = data.data?.id;
    if (!id) throw new Error('X create Post response did not include a Post id');

    return {
      id,
      url: `https://x.com/i/web/status/${id}`,
      platform: 'x',
      publishedAt: new Date().toISOString(),
    };
  },

  // Browser-mode by default \u2014 the v2 free tier blocks posting and the paid
  // tier is $200/mo+ for hobby use. cookieSetup grabs auth_token + ct0 from a
  // signed-in browser; Playwright drives the post() flow with those cookies
  // pre-loaded. Users who do have API access can `sh1pt secret set X_BEARER_TOKEN`
  // separately and flip mode to 'api'.
  setup: cookieSetup({
    label: 'X (Twitter)',
    loginUrl: 'https://x.com/login',
    cookies: [
      { name: 'auth_token', secretKey: 'X_AUTH_TOKEN', description: 'session token', required: true },
      { name: 'ct0',        secretKey: 'X_CT0',        description: 'CSRF token',    required: true },
    ],
    steps: [
      'Both cookies are HttpOnly \u2014 DevTools \u2192 Application \u2192 Cookies \u2192 x.com is the easiest path.',
      'Or: install a "Cookie Editor" extension and paste the JSON export.',
    ],
  }),
});

function formatXPost(text: string, config: Config): Record<string, unknown> {
  return {
    text,
    media: config.mediaIds?.length ? { media_ids: config.mediaIds } : undefined,
    reply: config.replyToPostId ? { in_reply_to_tweet_id: config.replyToPostId } : undefined,
    quote_tweet_id: config.quotePostId,
  };
}

async function readXResponse(res: Response): Promise<XCreatePostResponse> {
  try {
    return await res.json() as XCreatePostResponse;
  } catch {
    return { errors: [{ detail: res.statusText }] };
  }
}

function xErrorMessage(data: XCreatePostResponse, fallback: string): string {
  const firstError = data.errors?.[0];
  return firstError?.detail ?? firstError?.title ?? fallback;
}
