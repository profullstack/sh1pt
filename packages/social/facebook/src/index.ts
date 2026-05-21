import { defineSocial, oauthSetup, type MediaAttachment, type SocialPost } from '@profullstack/sh1pt-core';

// Facebook Page posts via Graph API. /{page-id}/feed + attached media.
// Requires a Page access token (long-lived via /oauth/access_token).
interface Config {
  pageId: string;
  apiVersion?: string;
  published?: boolean;
}

interface FacebookGraphResponse {
  id?: string;
  post_id?: string;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
}

export default defineSocial<Config>({
  id: 'social-facebook',
  label: 'Facebook',
  requires: { maxBodyChars: 63_000, maxHashtags: 30, hashtagsInBody: true },
  async connect(ctx, config) {
    if (!ctx.secret('META_PAGE_ACCESS_TOKEN')) throw new Error('META_PAGE_ACCESS_TOKEN not in vault (shared with Instagram)');
    return { accountId: config.pageId };
  },
  async post(ctx, post, config) {
    const token = ctx.secret('META_PAGE_ACCESS_TOKEN');
    if (!token) throw new Error('META_PAGE_ACCESS_TOKEN not in vault (shared with Instagram)');
    ctx.log(`facebook post · page=${config.pageId}`);
    if (ctx.dryRun) return { id: 'dry-run', url: `https://facebook.com/${config.pageId}`, platform: 'facebook', publishedAt: new Date().toISOString() };

    const media = firstMedia(post.media);
    if (media && media.kind !== 'image') {
      throw new Error('Facebook social adapter currently supports text/link posts and image URL posts only');
    }

    const result = media
      ? await createPhotoPost(config, token, post, media)
      : await createFeedPost(config, token, post);
    const id = result.post_id ?? result.id;
    if (!id) throw new Error('Facebook Graph API response did not include a post id');
    return {
      id,
      url: `https://www.facebook.com/${id}`,
      platform: 'facebook',
      publishedAt: new Date().toISOString(),
    };
  },

  setup: oauthSetup({
    secretKey: "FACEBOOK_PAGE_ACCESS_TOKEN",
    label: "Facebook Page",
    vendorDocUrl: "https://developers.facebook.com/docs/graph-api/reference/page/feed/",
    steps: [
      "Open developers.facebook.com \u2192 Apps \u2192 your app \u2192 Settings",
      "Request pages_manage_posts, pages_read_engagement, and pages_show_list through App Review",
      "Use the Graph API Explorer to mint a long-lived Page access token",
    ],
  }),
});

async function createFeedPost(config: Config, token: string, post: SocialPost): Promise<FacebookGraphResponse> {
  const body = new URLSearchParams({
    message: formatMessage(post),
    published: String(config.published ?? true),
  });
  if (post.link) body.set('link', post.link);
  return postGraph(config, token, 'feed', body);
}

async function createPhotoPost(
  config: Config,
  token: string,
  post: SocialPost,
  media: MediaAttachment,
): Promise<FacebookGraphResponse> {
  if (!/^https?:\/\//.test(media.file)) {
    throw new Error('Facebook image posts require media.file to be a public http(s) URL');
  }

  const body = new URLSearchParams({
    url: media.file,
    caption: formatMessage(post),
    published: String(config.published ?? true),
  });
  return postGraph(config, token, 'photos', body);
}

async function postGraph(
  config: Config,
  token: string,
  edge: 'feed' | 'photos',
  body: URLSearchParams,
): Promise<FacebookGraphResponse> {
  const res = await fetch(graphEndpoint(config, edge), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await readGraphResponse(res);
  if (!res.ok) throw new Error(graphErrorMessage(data, res.statusText, token));
  return data;
}

function graphEndpoint(config: Config, edge: 'feed' | 'photos'): string {
  const version = config.apiVersion ?? 'v25.0';
  return `https://graph.facebook.com/${version}/${encodeURIComponent(config.pageId)}/${edge}`;
}

function firstMedia(media: MediaAttachment[] | undefined): MediaAttachment | undefined {
  return media?.find((item) => item.kind === 'image' || item.kind === 'video' || item.kind === 'gif');
}

function formatMessage(post: SocialPost): string {
  const tags = (post.hashtags ?? []).slice(0, 30).map((tag) => `#${tag}`).join(' ');
  const text = tags ? `${post.body} ${tags}` : post.body;
  return text.slice(0, 63_000);
}

async function readGraphResponse(res: Response): Promise<FacebookGraphResponse> {
  try {
    return await res.json() as FacebookGraphResponse;
  } catch {
    return { error: { message: res.statusText } };
  }
}

function graphErrorMessage(data: FacebookGraphResponse, fallback: string, token: string): string {
  return (data.error?.message ?? fallback).replaceAll(token, '[redacted]');
}
