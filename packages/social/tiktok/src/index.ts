import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { defineSocial, oauthSetup, type MediaAttachment, type SocialPost } from '@profullstack/sh1pt-core';

const TIKTOK_ACCESS_TOKEN_SECRET = 'TIKTOK_ACCESS_TOKEN';
const DEFAULT_API_BASE_URL = 'https://open.tiktokapis.com';
const DIRECT_POST_ENDPOINT = '/v2/post/publish/video/init/';
const UPLOAD_ONLY_ENDPOINT = '/v2/post/publish/inbox/video/init/';
const MIN_CHUNK_BYTES = 5 * 1024 * 1024;
const MAX_CHUNK_BYTES = 64 * 1024 * 1024;

// TikTok Content Posting API. Direct Post requires the video.publish scope
// and app approval; upload-only sends a creator inbox notification instead.
interface Config {
  openId?: string;
  mode?: 'direct-post' | 'upload-only';
  privacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY';
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  videoCoverTimestampMs?: number;
  brandContent?: boolean;
  brandOrganic?: boolean;
  isAigc?: boolean;
  apiBaseUrl?: string;
  profileUrl?: string;
}

interface TikTokInitResponse {
  data?: {
    publish_id?: string;
    upload_url?: string;
  };
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
    logid?: string;
  };
}

interface LoadedVideo {
  bytes: Uint8Array;
  mimeType: string;
}

interface SourceInfo {
  source: 'FILE_UPLOAD' | 'PULL_FROM_URL';
  video_url?: string;
  video_size?: number;
  chunk_size?: number;
  total_chunk_count?: number;
}

export default defineSocial<Config>({
  id: 'social-tiktok',
  label: 'TikTok',
  requires: { media: ['video'], maxBodyChars: 2200, maxHashtags: 30, hashtagsInBody: true },

  async connect(ctx, config) {
    if (!ctx.secret(TIKTOK_ACCESS_TOKEN_SECRET)) throw new Error('TIKTOK_ACCESS_TOKEN not in vault');
    return { accountId: config.openId ?? 'tiktok' };
  },

  async post(ctx, post, config) {
    const video = firstVideo(post.media);
    if (!video) throw new Error('TikTok requires a video attachment');
    const mode = config.mode ?? 'upload-only';
    ctx.log(`tiktok post - mode=${mode} - video duration=${video.durationSec ?? '?'}s`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://tiktok.com/', platform: 'tiktok', publishedAt: new Date().toISOString() };

    const token = ctx.secret(TIKTOK_ACCESS_TOKEN_SECRET);
    if (!token) throw new Error('TIKTOK_ACCESS_TOKEN not in vault');

    const source = await sourceInfo(video);
    const init = await initializeVideo(token, post, config, mode, source.info);
    if (!init.data?.publish_id) throw new Error('TikTok init response did not include a publish_id');

    if (source.video) {
      if (!init.data.upload_url) throw new Error('TikTok init response did not include an upload_url for FILE_UPLOAD');
      await uploadVideo(init.data.upload_url, source.video);
    }

    return {
      id: init.data.publish_id,
      url: config.profileUrl ?? (mode === 'upload-only' ? 'https://www.tiktok.com/upload' : 'https://www.tiktok.com/'),
      platform: 'tiktok',
      publishedAt: new Date().toISOString(),
    };
  },

  setup: oauthSetup({
    secretKey: TIKTOK_ACCESS_TOKEN_SECRET,
    label: 'TikTok',
    vendorDocUrl: 'https://developers.tiktok.com/doc/content-posting-api-get-started/',
    steps: [
      'Open developers.tiktok.com -> Manage Apps -> Create App',
      'Add Content Posting API and request video.upload for inbox uploads or video.publish for Direct Post',
      'Complete the OAuth flow for the target TikTok account and store TIKTOK_ACCESS_TOKEN',
      'Provide a video media attachment; local files are uploaded to TikTok, public URLs use PULL_FROM_URL',
    ],
  }),
});

async function initializeVideo(
  token: string,
  post: SocialPost,
  config: Config,
  mode: NonNullable<Config['mode']>,
  source: SourceInfo,
): Promise<TikTokInitResponse> {
  const baseUrl = (config.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, '');
  const endpoint = mode === 'direct-post' ? DIRECT_POST_ENDPOINT : UPLOAD_ONLY_ENDPOINT;
  const body = mode === 'direct-post'
    ? { post_info: directPostInfo(post, config), source_info: source }
    : { source_info: source };

  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(body),
  });
  const data = await readTikTokResponse(res);
  const apiCode = data.error?.code;
  if (!res.ok || (apiCode && apiCode !== 'ok')) {
    throw new Error(redactSecrets(`TikTok video init failed: ${tiktokErrorMessage(data, res.statusText)}`, [token]));
  }
  return data;
}

async function uploadVideo(uploadUrl: string, video: LoadedVideo): Promise<void> {
  const chunks = chunkPlan(video.bytes.byteLength);
  for (let index = 0; index < chunks.totalChunkCount; index += 1) {
    const start = index * chunks.chunkSize;
    const endExclusive = index === chunks.totalChunkCount - 1
      ? video.bytes.byteLength
      : Math.min(start + chunks.chunkSize, video.bytes.byteLength);
    const chunk = video.bytes.slice(start, endExclusive);
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'content-length': String(chunk.byteLength),
        'content-type': video.mimeType,
        'content-range': `bytes ${start}-${endExclusive - 1}/${video.bytes.byteLength}`,
      },
      body: chunk,
    });
    if (!res.ok) throw new Error(`TikTok video upload chunk failed: ${res.statusText}`);
  }
}

async function sourceInfo(media: MediaAttachment): Promise<{ info: SourceInfo; video?: LoadedVideo }> {
  if (/^https?:\/\//.test(media.file)) {
    return {
      info: {
        source: 'PULL_FROM_URL',
        video_url: media.file,
      },
    };
  }

  const bytes = readFileSync(media.file);
  const plan = chunkPlan(bytes.byteLength);
  return {
    info: {
      source: 'FILE_UPLOAD',
      video_size: bytes.byteLength,
      chunk_size: plan.chunkSize,
      total_chunk_count: plan.totalChunkCount,
    },
    video: {
      bytes,
      mimeType: guessVideoMime(media.file),
    },
  };
}

function directPostInfo(post: SocialPost, config: Config): Record<string, unknown> {
  const info: Record<string, unknown> = {
    title: formatCaption(post),
    privacy_level: config.privacyLevel ?? 'SELF_ONLY',
    brand_content_toggle: config.brandContent ?? false,
    brand_organic_toggle: config.brandOrganic ?? false,
  };
  if (config.disableDuet !== undefined) info.disable_duet = config.disableDuet;
  if (config.disableComment !== undefined) info.disable_comment = config.disableComment;
  if (config.disableStitch !== undefined) info.disable_stitch = config.disableStitch;
  if (config.videoCoverTimestampMs !== undefined) info.video_cover_timestamp_ms = config.videoCoverTimestampMs;
  if (config.isAigc !== undefined) info.is_aigc = config.isAigc;
  return info;
}

function formatCaption(post: SocialPost): string {
  const parts = [post.body.trim()];
  if (post.link) parts.push(post.link);
  const hashtags = (post.hashtags ?? []).slice(0, 30).map((tag) => `#${tag}`).join(' ');
  if (hashtags) parts.push(hashtags);
  return truncateUtf16(parts.filter(Boolean).join('\n'), 2200);
}

function truncateUtf16(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function firstVideo(media: MediaAttachment[] | undefined): MediaAttachment | undefined {
  return media?.find((item) => item.kind === 'video');
}

function chunkPlan(videoSize: number): { chunkSize: number; totalChunkCount: number } {
  if (videoSize <= 0) throw new Error('TikTok video attachment is empty');
  if (videoSize <= MAX_CHUNK_BYTES) return { chunkSize: videoSize, totalChunkCount: 1 };

  const estimatedChunks = Math.ceil(videoSize / MAX_CHUNK_BYTES);
  const chunkSize = Math.max(MIN_CHUNK_BYTES, Math.floor(videoSize / estimatedChunks));
  return {
    chunkSize,
    totalChunkCount: Math.floor(videoSize / chunkSize),
  };
}

function guessVideoMime(file: string): string {
  switch (extname(file).toLowerCase()) {
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    case '.mp4':
    default:
      return 'video/mp4';
  }
}

async function readTikTokResponse(res: Response): Promise<TikTokInitResponse> {
  try {
    return await res.json() as TikTokInitResponse;
  } catch {
    return { error: { message: res.statusText } };
  }
}

function tiktokErrorMessage(data: TikTokInitResponse, fallback: string): string {
  const code = data.error?.code;
  const message = data.error?.message;
  if (code && message) return `${code}: ${message}`;
  return message ?? code ?? fallback;
}

function redactSecrets(message: string, secrets: Array<string | undefined>): string {
  let redacted = message;
  for (const secret of secrets) {
    if (secret) redacted = redacted.replaceAll(secret, '[redacted]');
  }
  return redacted;
}
