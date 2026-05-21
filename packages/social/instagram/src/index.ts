import { defineSocial, oauthSetup, type MediaAttachment, type SocialPost } from '@profullstack/sh1pt-core';

// Instagram Graph API (Meta). Photo / carousel / reel endpoints.
// Requires a Business or Creator IG account linked to a Facebook Page
// (can't post to personal accounts via API). Media is MANDATORY.
interface Config {
  igUserId: string;            // Instagram Business Account id
  pageId: string;              // linked FB Page
  format?: 'feed' | 'reel' | 'story' | 'carousel';
  apiVersion?: string;
  graphBaseUrl?: string;
  pollAttempts?: number;
  pollIntervalMs?: number;
  skipVideoProcessingPoll?: boolean;
}

interface InstagramResponse {
  id?: string;
  status_code?: 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED';
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
}

export default defineSocial<Config>({
  id: 'social-instagram',
  label: 'Instagram',
  requires: { media: ['image', 'video'], maxBodyChars: 2200, maxHashtags: 30, hashtagsInBody: true },

  async connect(ctx, config) {
    if (!instagramToken(ctx)) throw new Error('INSTAGRAM_ACCESS_TOKEN or META_PAGE_ACCESS_TOKEN not in vault');
    return { accountId: config.igUserId };
  },

  async post(ctx, post, config) {
    if (!post.media?.length) {
      throw new Error('Instagram requires at least one image or video');
    }
    const token = instagramToken(ctx);
    if (!token) throw new Error('INSTAGRAM_ACCESS_TOKEN or META_PAGE_ACCESS_TOKEN not in vault');
    const format = config.format ?? (post.media.some((m) => m.kind === 'video') ? 'reel' : 'feed');
    ctx.log(`instagram post · format=${format} · media=${post.media.length}`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://instagram.com/', platform: 'instagram', publishedAt: new Date().toISOString() };

    const media = supportedMedia(post.media);
    const container = format === 'carousel'
      ? await createCarouselContainer(config, token, post, media)
      : await createSingleContainer(config, token, post, media[0]!, format);
    if (!container.id) throw new Error('Instagram media container response did not include an id');

    if (media.some((item) => item.kind === 'video') && !config.skipVideoProcessingPoll) {
      await waitForContainer(config, token, container.id);
    }

    const published = await publishContainer(config, token, container.id);
    if (!published.id) throw new Error('Instagram media_publish response did not include a media id');
    return { id: published.id, url: 'https://www.instagram.com/', platform: 'instagram', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: "INSTAGRAM_ACCESS_TOKEN",
    label: "Instagram (Graph API)",
    vendorDocUrl: "https://developers.facebook.com/docs/instagram-platform/content-publishing/",
    steps: [
      "Open developers.facebook.com \u2192 Apps \u2192 your app \u2192 Instagram \u2192 Basic Display or Graph API",
      "Connect an Instagram Business/Creator account linked to a Facebook Page",
      "Generate a token with instagram_content_publish, instagram_basic, pages_show_list, and pages_read_engagement",
    ],
  }),
});

function instagramToken(ctx: { secret(key: string): string | undefined }): string | undefined {
  return ctx.secret('INSTAGRAM_ACCESS_TOKEN') ?? ctx.secret('META_PAGE_ACCESS_TOKEN');
}

async function createSingleContainer(
  config: Config,
  token: string,
  post: SocialPost,
  media: MediaAttachment,
  format: Config['format'],
): Promise<InstagramResponse> {
  if (format === 'carousel') throw new Error('Carousel publishing requires multiple media attachments');
  const body = mediaBody(token, media, format);
  body.set('caption', formatCaption(post));
  return postInstagram(config, token, 'media', body);
}

async function createCarouselContainer(
  config: Config,
  token: string,
  post: SocialPost,
  media: MediaAttachment[],
): Promise<InstagramResponse> {
  if (media.length < 2 || media.length > 10) {
    throw new Error('Instagram carousel posts require 2 to 10 image/video attachments');
  }

  const children: string[] = [];
  for (const item of media) {
    const body = mediaBody(token, item, 'feed');
    body.set('is_carousel_item', 'true');
    const child = await postInstagram(config, token, 'media', body);
    if (!child.id) throw new Error('Instagram carousel child response did not include an id');
    children.push(child.id);
  }

  return postInstagram(config, token, 'media', new URLSearchParams({
    access_token: token,
    media_type: 'CAROUSEL',
    children: children.join(','),
    caption: formatCaption(post),
  }));
}

async function publishContainer(config: Config, token: string, creationId: string): Promise<InstagramResponse> {
  return postInstagram(config, token, 'media_publish', new URLSearchParams({
    access_token: token,
    creation_id: creationId,
  }));
}

async function waitForContainer(config: Config, token: string, containerId: string): Promise<void> {
  const attempts = config.pollAttempts ?? 10;
  const delay = config.pollIntervalMs ?? 1_000;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await getInstagram(config, token, containerId, { fields: 'status_code' });
    if (status.status_code === 'FINISHED' || status.status_code === 'PUBLISHED') return;
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      throw new Error(`Instagram media container status is ${status.status_code}`);
    }
    if (attempt < attempts - 1 && delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error('Instagram media container did not finish processing before publish');
}

async function postInstagram(
  config: Config,
  token: string,
  edge: 'media' | 'media_publish',
  body: URLSearchParams,
): Promise<InstagramResponse> {
  const res = await fetch(endpoint(config, edge), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await readInstagramResponse(res);
  if (!res.ok) throw new Error(instagramErrorMessage(data, res.statusText, token));
  return data;
}

async function getInstagram(
  config: Config,
  token: string,
  objectId: string,
  params: Record<string, string>,
): Promise<InstagramResponse> {
  const url = new URL(endpoint(config, objectId));
  url.searchParams.set('access_token', token);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url);
  const data = await readInstagramResponse(res);
  if (!res.ok) throw new Error(instagramErrorMessage(data, res.statusText, token));
  return data;
}

function endpoint(config: Config, edgeOrObjectId: string): string {
  const base = config.graphBaseUrl ?? 'https://graph.instagram.com';
  const version = config.apiVersion ?? 'v25.0';
  const id = edgeOrObjectId === 'media' || edgeOrObjectId === 'media_publish'
    ? config.igUserId
    : edgeOrObjectId;
  const edge = edgeOrObjectId === 'media' || edgeOrObjectId === 'media_publish'
    ? `/${edgeOrObjectId}`
    : '';
  return `${base.replace(/\/+$/, '')}/${version}/${encodeURIComponent(id)}${edge}`;
}

function supportedMedia(media: MediaAttachment[]): MediaAttachment[] {
  const selected = media.filter((item) => item.kind === 'image' || item.kind === 'video');
  if (selected.length !== media.length) {
    throw new Error('Instagram supports image and video media attachments only');
  }
  for (const item of selected) publicMediaUrl(item);
  return selected;
}

function mediaBody(token: string, media: MediaAttachment, format: Config['format']): URLSearchParams {
  const body = new URLSearchParams({ access_token: token });
  if (media.kind === 'image') {
    body.set('image_url', publicMediaUrl(media));
    if (media.alt) body.set('alt_text', media.alt);
    if (format === 'story') body.set('media_type', 'STORIES');
  } else {
    body.set('video_url', publicMediaUrl(media));
    body.set('media_type', format === 'story' ? 'STORIES' : format === 'feed' ? 'VIDEO' : 'REELS');
  }
  return body;
}

function publicMediaUrl(media: MediaAttachment): string {
  if (!/^https?:\/\//.test(media.file)) {
    throw new Error('Instagram media publishing requires media.file to be a public http(s) URL');
  }
  return media.file;
}

function formatCaption(post: SocialPost): string {
  const link = post.link ? `\n${post.link}` : '';
  const hashtags = (post.hashtags ?? []).slice(0, 30).map((tag) => `#${tag}`).join(' ');
  const caption = `${post.body}${link}${hashtags ? ` ${hashtags}` : ''}`;
  return caption.slice(0, 2_200);
}

async function readInstagramResponse(res: Response): Promise<InstagramResponse> {
  try {
    return await res.json() as InstagramResponse;
  } catch {
    return { error: { message: res.statusText } };
  }
}

function instagramErrorMessage(data: InstagramResponse, fallback: string, token: string): string {
  return (data.error?.message ?? fallback).replaceAll(token, '[redacted]');
}
