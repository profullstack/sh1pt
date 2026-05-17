import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// Reddit — text/link/image submissions via /api/submit. Each subreddit
// has its own rules + karma requirements; self-promotion in the wrong
// sub is the fastest way to get an account shadow-banned.
interface Config {
  subreddit: string;           // without 'r/' prefix
  kind?: 'self' | 'link' | 'image';
  flairId?: string;
}

interface RedditSubmitResponse {
  json?: {
    data?: {
      id?: string;
      url?: string;
    };
    errors?: Array<[string, string, string?]>;
  };
}

export default defineSocial<Config>({
  id: 'social-reddit',
  label: 'Reddit',
  requires: { maxBodyChars: 40_000, maxHashtags: 0 },   // Reddit doesn't use hashtags
  async connect(ctx) {
    if (!ctx.secret('REDDIT_ACCESS_TOKEN') && !ctx.secret('REDDIT_REFRESH_TOKEN')) {
      throw new Error('REDDIT_ACCESS_TOKEN or REDDIT_REFRESH_TOKEN not in vault — run: sh1pt secret set REDDIT_ACCESS_TOKEN <access-token>');
    }
    return { accountId: 'reddit' };
  },
  async post(ctx, post, config) {
    if (!post.title) throw new Error('Reddit requires a title');
    const token = ctx.secret('REDDIT_ACCESS_TOKEN');
    if (!token) throw new Error('REDDIT_ACCESS_TOKEN not in vault — run: sh1pt secret set REDDIT_ACCESS_TOKEN <access-token>');
    ctx.log(`reddit submit · r/${config.subreddit} · kind=${config.kind ?? 'self'}`);
    if (ctx.dryRun) return { id: 'dry-run', url: `https://reddit.com/r/${config.subreddit}`, platform: 'reddit', publishedAt: new Date().toISOString() };

    const res = await fetch('https://oauth.reddit.com/api/submit', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: formatSubmitBody(post, config),
    });
    const data = await parseSubmitResponse(res);
    if (!res.ok) throw new Error(data.json?.errors?.[0]?.[1] ?? res.statusText);
    const redditError = data.json?.errors?.[0];
    if (redditError) throw new Error(`${redditError[0]}: ${redditError[1]}`);

    const submitted = data.json?.data;
    if (!submitted?.id || !submitted.url) throw new Error('Reddit submit response did not include a post id and URL');
    return { id: submitted.id, url: submitted.url, platform: 'reddit', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: 'REDDIT_ACCESS_TOKEN',
    label: 'Reddit',
    vendorDocUrl: 'https://www.reddit.com/prefs/apps',
    steps: [
      'Open reddit.com/prefs/apps -> create another app -> installed app',
      'Set redirect URI to http://127.0.0.1:8765/callback',
      'Copy the client id (under the app name) - installed apps have no secret',
      'sh1pt opens the OAuth flow; refresh tokens are saved automatically',
    ],
    // Reddit installed-app PKCE. The token endpoint demands Basic auth
    // even for installed apps (client_id with an empty password); the
    // helper passes that through `tokenAuthHeader`.
    ...(process.env.SH1PT_REDDIT_CLIENT_ID
      ? {
          loopback: {
            clientId: process.env.SH1PT_REDDIT_CLIENT_ID,
            authUrl: 'https://www.reddit.com/api/v1/authorize',
            tokenUrl: 'https://www.reddit.com/api/v1/access_token',
            scopes: ['submit', 'read', 'identity', 'edit', 'flair'],
            refreshSecretKey: 'REDDIT_REFRESH_TOKEN',
            extraAuthParams: { duration: 'permanent' },
            tokenAuthHeader: `Basic ${Buffer.from(`${process.env.SH1PT_REDDIT_CLIENT_ID}:`).toString('base64')}`,
          },
        }
      : {}),
  }),
});

function formatSubmitBody(post: { title?: string; body: string; link?: string }, config: Config): URLSearchParams {
  const kind = config.kind ?? (post.link ? 'link' : 'self');
  const body = new URLSearchParams({
    api_type: 'json',
    kind,
    sr: config.subreddit,
    title: post.title ?? '',
  });
  if (config.flairId) body.set('flair_id', config.flairId);
  if (kind === 'link') {
    body.set('url', post.link ?? post.body);
  } else {
    body.set('text', post.body.slice(0, 40_000));
  }
  return body;
}

async function parseSubmitResponse(res: Response): Promise<RedditSubmitResponse> {
  try {
    return await res.json() as RedditSubmitResponse;
  } catch {
    return { json: { errors: [['HTTP_ERROR', res.statusText]] } };
  }
}
