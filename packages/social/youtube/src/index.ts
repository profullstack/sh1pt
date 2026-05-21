import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { defineSocial, oauthSetup, type MediaAttachment, type SocialPost } from '@profullstack/sh1pt-core';

const YOUTUBE_ACCESS_TOKEN_SECRET = 'YOUTUBE_ACCESS_TOKEN';
const YOUTUBE_REFRESH_TOKEN_SECRET = 'YOUTUBE_OAUTH_REFRESH_TOKEN';
const YOUTUBE_CLIENT_ID_SECRET = 'YOUTUBE_CLIENT_ID';
const YOUTUBE_CLIENT_SECRET_SECRET = 'YOUTUBE_CLIENT_SECRET';
const DEFAULT_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_UPLOAD_BASE_URL = 'https://www.googleapis.com';

// YouTube Data API v3. Upload videos through videos.insert with a resumable
// upload session. This adapter never fakes a non-dry-run upload.
interface Config {
  channelId?: string;
  privacyStatus?: 'public' | 'unlisted' | 'private';
  category?: string;           // numeric category id (e.g. '28' = Science/Tech)
  defaultLanguage?: string;
  madeForKids?: boolean;
  containsSyntheticMedia?: boolean;
  embeddable?: boolean;
  notifySubscribers?: boolean;
  tokenUrl?: string;
  uploadBaseUrl?: string;
}

interface OAuthTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface YouTubeVideoResponse {
  id?: string;
  snippet?: {
    title?: string;
    publishedAt?: string;
  };
  status?: {
    privacyStatus?: string;
    publishAt?: string;
  };
  error?: {
    message?: string;
    errors?: Array<{ message?: string; reason?: string }>;
  };
}

interface LoadedVideo {
  bytes: Uint8Array;
  mimeType: string;
}

export default defineSocial<Config>({
  id: 'social-youtube',
  label: 'YouTube',
  requires: { media: ['video'], maxBodyChars: 5000, maxHashtags: 15, hashtagsInBody: true },

  async connect(ctx) {
    if (!hasAccessPath(ctx)) {
      throw new Error('YOUTUBE_ACCESS_TOKEN not in vault — run `sh1pt secret set YOUTUBE_ACCESS_TOKEN`, or set YOUTUBE_OAUTH_REFRESH_TOKEN + YOUTUBE_CLIENT_ID');
    }
    return { accountId: 'youtube' };
  },

  async post(ctx, post, config) {
    const video = firstVideo(post.media);
    if (!video) throw new Error('YouTube requires a video attachment');
    ctx.log(`youtube upload · privacy=${config.privacyStatus ?? 'public'}`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://youtube.com/', platform: 'youtube', publishedAt: new Date().toISOString() };

    const token = await accessToken(ctx, config);
    const media = await loadVideo(video);
    const sessionUrl = await createUploadSession(token, post, config, media);
    const uploaded = await uploadVideo(sessionUrl, token, media);
    if (!uploaded.id) throw new Error('YouTube videos.insert response did not include a video id');

    return {
      id: uploaded.id,
      url: `https://www.youtube.com/watch?v=${uploaded.id}`,
      platform: 'youtube',
      publishedAt: new Date(uploaded.status?.publishAt ?? uploaded.snippet?.publishedAt ?? Date.now()).toISOString(),
    };
  },

  setup: oauthSetup({
    secretKey: YOUTUBE_ACCESS_TOKEN_SECRET,
    label: 'YouTube',
    vendorDocUrl: 'https://developers.google.com/youtube/v3/docs/videos/insert',
    steps: [
      'Enable YouTube Data API v3 in Google Cloud Console',
      'Create OAuth 2.0 credentials and request https://www.googleapis.com/auth/youtube.upload',
      `Store either ${YOUTUBE_ACCESS_TOKEN_SECRET}, or ${YOUTUBE_REFRESH_TOKEN_SECRET} plus ${YOUTUBE_CLIENT_ID_SECRET} and optional ${YOUTUBE_CLIENT_SECRET_SECRET}`,
      'Provide a video media attachment; this adapter starts a resumable upload session and uploads the bytes',
    ],
  }),
});

function hasAccessPath(ctx: { secret(k: string): string | undefined }): boolean {
  return Boolean(ctx.secret(YOUTUBE_ACCESS_TOKEN_SECRET))
    || Boolean(ctx.secret(YOUTUBE_REFRESH_TOKEN_SECRET) && ctx.secret(YOUTUBE_CLIENT_ID_SECRET));
}

async function accessToken(ctx: { secret(k: string): string | undefined }, config: Config): Promise<string> {
  const existing = ctx.secret(YOUTUBE_ACCESS_TOKEN_SECRET);
  if (existing) return existing;

  const refreshToken = ctx.secret(YOUTUBE_REFRESH_TOKEN_SECRET);
  const clientId = ctx.secret(YOUTUBE_CLIENT_ID_SECRET);
  const clientSecret = ctx.secret(YOUTUBE_CLIENT_SECRET_SECRET);
  if (!refreshToken || !clientId) {
    throw new Error(`YouTube upload needs ${YOUTUBE_ACCESS_TOKEN_SECRET} or ${YOUTUBE_REFRESH_TOKEN_SECRET} + ${YOUTUBE_CLIENT_ID_SECRET} in vault`);
  }

  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  if (clientSecret) body.set('client_secret', clientSecret);

  const res = await fetch(config.tokenUrl ?? DEFAULT_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await readOAuthToken(res);
  if (!res.ok || !data.access_token) {
    const message = data.error_description ?? data.error ?? res.statusText;
    throw new Error(redactSecrets(`YouTube OAuth token refresh failed: ${message}`, [refreshToken, clientId, clientSecret]));
  }
  return data.access_token;
}

async function createUploadSession(token: string, post: SocialPost, config: Config, media: LoadedVideo): Promise<string> {
  const baseUrl = (config.uploadBaseUrl ?? DEFAULT_UPLOAD_BASE_URL).replace(/\/+$/, '');
  const params = new URLSearchParams({
    uploadType: 'resumable',
    part: 'snippet,status',
  });
  if (config.notifySubscribers !== undefined) params.set('notifySubscribers', String(config.notifySubscribers));

  const metadata = youtubeVideoResource(post, config);
  const metadataBody = JSON.stringify(metadata);
  const res = await fetch(`${baseUrl}/upload/youtube/v3/videos?${params}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-length': String(new TextEncoder().encode(metadataBody).byteLength),
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-length': String(media.bytes.byteLength),
      'x-upload-content-type': media.mimeType,
    },
    body: metadataBody,
  });

  if (!res.ok) {
    const data = await readYouTubeResponse(res);
    throw new Error(redactSecrets(`YouTube upload session failed: ${youtubeErrorMessage(data, res.statusText)}`, [token]));
  }
  const location = res.headers.get('location');
  if (!location) throw new Error('YouTube upload session response did not include a Location header');
  return location;
}

async function uploadVideo(sessionUrl: string, token: string, media: LoadedVideo): Promise<YouTubeVideoResponse> {
  const size = media.bytes.byteLength;
  const res = await fetch(sessionUrl, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token}`,
      'content-length': String(size),
      'content-type': media.mimeType,
      'content-range': `bytes 0-${size - 1}/${size}`,
    },
    body: media.bytes,
  });
  const data = await readYouTubeResponse(res);
  if (!res.ok) {
    throw new Error(redactSecrets(`YouTube video upload failed: ${youtubeErrorMessage(data, res.statusText)}`, [token]));
  }
  return data;
}

function youtubeVideoResource(post: SocialPost, config: Config): Record<string, unknown> {
  const publishAt = post.schedule?.toISOString();
  return {
    snippet: {
      channelId: config.channelId,
      title: youtubeTitle(post),
      description: youtubeDescription(post),
      tags: (post.hashtags ?? []).slice(0, 15),
      categoryId: config.category ?? '22',
      defaultLanguage: config.defaultLanguage,
    },
    status: {
      privacyStatus: publishAt ? 'private' : (config.privacyStatus ?? 'public'),
      publishAt,
      selfDeclaredMadeForKids: config.madeForKids ?? false,
      containsSyntheticMedia: config.containsSyntheticMedia,
      embeddable: config.embeddable,
    },
  };
}

function youtubeTitle(post: SocialPost): string {
  const title = (post.title ?? firstLine(post.body) ?? 'Untitled video').trim();
  return title.length > 100 ? `${title.slice(0, 97)}...` : title;
}

function youtubeDescription(post: SocialPost): string {
  const parts = [post.body.trim()];
  if (post.link) parts.push(post.link);
  const hashtags = (post.hashtags ?? []).slice(0, 15).map((tag) => `#${tag}`).join(' ');
  if (hashtags) parts.push(hashtags);
  const description = parts.filter(Boolean).join('\n\n');
  return description.length > 5000 ? `${description.slice(0, 4997)}...` : description;
}

function firstLine(value: string): string | undefined {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
}

function firstVideo(media: MediaAttachment[] | undefined): MediaAttachment | undefined {
  return media?.find((item) => item.kind === 'video');
}

async function loadVideo(media: MediaAttachment): Promise<LoadedVideo> {
  if (/^https?:\/\//.test(media.file)) {
    const res = await fetch(media.file);
    if (!res.ok) throw new Error(`Could not fetch YouTube video media: ${res.statusText}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return {
      bytes,
      mimeType: normalizeVideoMime(res.headers.get('content-type')) ?? guessVideoMime(media.file),
    };
  }

  const bytes = readFileSync(media.file);
  return {
    bytes,
    mimeType: guessVideoMime(media.file),
  };
}

function guessVideoMime(file: string): string {
  switch (extname(file).toLowerCase()) {
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    case '.mkv':
      return 'video/x-matroska';
    case '.avi':
      return 'video/x-msvideo';
    case '.mpeg':
    case '.mpg':
      return 'video/mpeg';
    case '.mp4':
    default:
      return 'video/mp4';
  }
}

function normalizeVideoMime(value: string | null): string | undefined {
  const mime = value?.split(';')[0]?.trim().toLowerCase();
  return mime?.startsWith('video/') ? mime : undefined;
}

async function readOAuthToken(res: Response): Promise<OAuthTokenResponse> {
  try {
    return await res.json() as OAuthTokenResponse;
  } catch {
    return { error: res.statusText };
  }
}

async function readYouTubeResponse(res: Response): Promise<YouTubeVideoResponse> {
  try {
    return await res.json() as YouTubeVideoResponse;
  } catch {
    return { error: { message: res.statusText } };
  }
}

function youtubeErrorMessage(data: YouTubeVideoResponse, fallback: string): string {
  return data.error?.errors?.[0]?.message ?? data.error?.message ?? fallback;
}

function redactSecrets(message: string, secrets: Array<string | undefined>): string {
  let redacted = message;
  for (const secret of secrets) {
    if (secret) redacted = redacted.replaceAll(secret, '[redacted]');
  }
  return redacted;
}
