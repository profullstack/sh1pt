import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { defineSocial, oauthSetup, type MediaAttachment, type SocialPost } from '@profullstack/sh1pt-core';

const SNAPCHAT_ACCESS_TOKEN_SECRET = 'SNAPCHAT_ACCESS_TOKEN';
const DEFAULT_ADS_API_BASE_URL = 'https://adsapi.snapchat.com';
const DEFAULT_BUSINESS_API_BASE_URL = 'https://businessapi.snapchat.com';

// Snapchat Public Profile API. Access is allowlist-only and uses Snap
// Marketing API media objects before publishing Stories or Spotlights.
interface Config {
  profileId: string;
  adAccountId?: string;
  mode?: 'story' | 'spotlight';
  locale?: string;
  skipSaveToProfile?: boolean;
  mediaName?: string;
  profileUrl?: string;
  adsApiBaseUrl?: string;
  businessApiBaseUrl?: string;
}

interface SnapchatResponse {
  request_status?: string;
  request_id?: string;
  display_message?: string;
  debug_message?: string;
  error_code?: string;
  message?: string;
  spotlight_id?: string;
  media?: Array<{
    sub_request_status?: string;
    sub_request_error_reason?: string;
    media?: {
      id?: string;
      media_status?: string;
      created_at?: string;
    };
  }>;
  result?: {
    id?: string;
    media_status?: string;
    created_at?: string;
  };
}

interface LoadedMedia {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}

export default defineSocial<Config>({
  id: 'social-snapchat',
  label: 'Snapchat',
  requires: { media: ['image', 'video'], maxBodyChars: 250, maxHashtags: 10, hashtagsInBody: true },

  async connect(ctx, config) {
    if (!ctx.secret(SNAPCHAT_ACCESS_TOKEN_SECRET)) throw new Error('SNAPCHAT_ACCESS_TOKEN not in vault');
    return { accountId: config.profileId };
  },

  async post(ctx, post, config) {
    const media = firstSupportedMedia(post.media);
    if (!media) throw new Error('Snapchat requires at least one image or video');
    if (!config.adAccountId) throw new Error('Snapchat posting requires config.adAccountId to create the media object');

    const mode = config.mode ?? 'story';
    if (mode === 'spotlight' && media.kind !== 'video') throw new Error('Snapchat Spotlight posts require video media');
    ctx.log(`snapchat post - mode=${mode} - profile=${config.profileId} - media=${media.kind}`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://snapchat.com/', platform: 'snapchat', publishedAt: new Date().toISOString() };

    const token = ctx.secret(SNAPCHAT_ACCESS_TOKEN_SECRET);
    if (!token) throw new Error('SNAPCHAT_ACCESS_TOKEN not in vault');

    const loaded = await loadMedia(media);
    const mediaId = await createMedia(token, config, media, loaded);
    await uploadMedia(token, config, mediaId, loaded);
    const published = mode === 'spotlight'
      ? await publishSpotlight(token, config, post, mediaId)
      : await publishStory(token, config, mediaId);

    return {
      id: published.spotlight_id ?? published.request_id ?? mediaId,
      url: config.profileUrl ?? 'https://www.snapchat.com/',
      platform: 'snapchat',
      publishedAt: new Date().toISOString(),
    };
  },

  setup: oauthSetup({
    secretKey: SNAPCHAT_ACCESS_TOKEN_SECRET,
    label: 'Snapchat',
    vendorDocUrl: 'https://developers.snap.com/api/marketing-api/Public-Profile-API/GetStarted',
    steps: [
      'Create a Snap Business Account and OAuth app, then request Public Profile API allowlisting',
      'Request scopes for Marketing API and Public Profile API access, then complete OAuth for the profile owner',
      'Store SNAPCHAT_ACCESS_TOKEN and provide profileId plus adAccountId in adapter config',
      'Provide an image or video media attachment; the adapter creates media, uploads it, then posts a Story or Spotlight',
    ],
    ...(process.env.SH1PT_SNAPCHAT_CLIENT_ID
      ? {
          loopback: {
            clientId: process.env.SH1PT_SNAPCHAT_CLIENT_ID,
            authUrl: 'https://accounts.snapchat.com/login/oauth2/authorize',
            tokenUrl: 'https://accounts.snapchat.com/login/oauth2/access_token',
            scopes: ['snapchat-marketing-api', 'snapchat-profile-api'],
          },
        }
      : {}),
  }),
});

async function createMedia(token: string, config: Config, media: MediaAttachment, loaded: LoadedMedia): Promise<string> {
  const baseUrl = adsBaseUrl(config);
  const res = await fetch(`${baseUrl}/v1/adaccounts/${encodeURIComponent(config.adAccountId!)}/media`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      media: [{
        name: config.mediaName ?? loaded.fileName,
        type: media.kind === 'video' ? 'VIDEO' : 'IMAGE',
        ad_account_id: config.adAccountId,
      }],
    }),
  });
  const data = await readSnapchatResponse(res);
  if (!res.ok || !snapStatusOk(data.request_status)) {
    throw new Error(redactSecrets(`Snapchat create media failed: ${snapErrorMessage(data, res.statusText)}`, [token]));
  }
  const item = data.media?.[0];
  if (item && !snapStatusOk(item.sub_request_status)) {
    throw new Error(redactSecrets(`Snapchat create media failed: ${item.sub_request_error_reason ?? snapErrorMessage(data, res.statusText)}`, [token]));
  }
  const mediaId = item?.media?.id;
  if (!mediaId) throw new Error('Snapchat create media response did not include a media id');
  return mediaId;
}

async function uploadMedia(token: string, config: Config, mediaId: string, media: LoadedMedia): Promise<void> {
  const form = new FormData();
  form.append('file', new Blob([media.bytes], { type: media.mimeType }), media.fileName);
  const res = await fetch(`${adsBaseUrl(config)}/v1/media/${encodeURIComponent(mediaId)}/upload`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await readSnapchatResponse(res);
  if (!res.ok || !snapStatusOk(data.request_status)) {
    throw new Error(redactSecrets(`Snapchat media upload failed: ${snapErrorMessage(data, res.statusText)}`, [token]));
  }
}

async function publishStory(token: string, config: Config, mediaId: string): Promise<SnapchatResponse> {
  const res = await fetch(`${businessBaseUrl(config)}/v1/public_profiles/${encodeURIComponent(config.profileId)}/stories`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ media_id: mediaId }),
  });
  const data = await readSnapchatResponse(res);
  if (!res.ok || !snapStatusOk(data.request_status)) {
    throw new Error(redactSecrets(`Snapchat story publish failed: ${snapErrorMessage(data, res.statusText)}`, [token]));
  }
  return data;
}

async function publishSpotlight(token: string, config: Config, post: SocialPost, mediaId: string): Promise<SnapchatResponse> {
  const res = await fetch(`${businessBaseUrl(config)}/v1/public_profiles/${encodeURIComponent(config.profileId)}/spotlights`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      media_id: mediaId,
      skip_save_to_profile: config.skipSaveToProfile ?? false,
      description: spotlightDescription(post),
      locale: config.locale ?? 'en_US',
    }),
  });
  const data = await readSnapchatResponse(res);
  if (!res.ok || !snapStatusOk(data.request_status)) {
    throw new Error(redactSecrets(`Snapchat spotlight publish failed: ${snapErrorMessage(data, res.statusText)}`, [token]));
  }
  return data;
}

async function loadMedia(media: MediaAttachment): Promise<LoadedMedia> {
  if (/^https?:\/\//.test(media.file)) {
    const res = await fetch(media.file);
    if (!res.ok) throw new Error(`Could not fetch Snapchat media: ${res.statusText}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return {
      bytes,
      fileName: fileNameFromUrl(media.file, media.kind),
      mimeType: normalizeMime(res.headers.get('content-type'), media.kind) ?? guessMime(media.file, media.kind),
    };
  }

  return {
    bytes: readFileSync(media.file),
    fileName: basename(media.file),
    mimeType: guessMime(media.file, media.kind),
  };
}

function firstSupportedMedia(media: MediaAttachment[] | undefined): MediaAttachment | undefined {
  return media?.find((item) => item.kind === 'image' || item.kind === 'video');
}

function spotlightDescription(post: SocialPost): string {
  const parts = [post.body.trim()];
  if (post.link) parts.push(post.link);
  const hashtags = (post.hashtags ?? []).slice(0, 10).map((tag) => `#${tag}`).join(' ');
  if (hashtags) parts.push(hashtags);
  return parts.filter(Boolean).join(' ').slice(0, 160);
}

function adsBaseUrl(config: Config): string {
  return (config.adsApiBaseUrl ?? DEFAULT_ADS_API_BASE_URL).replace(/\/+$/, '');
}

function businessBaseUrl(config: Config): string {
  return (config.businessApiBaseUrl ?? DEFAULT_BUSINESS_API_BASE_URL).replace(/\/+$/, '');
}

function snapStatusOk(status: string | undefined): boolean {
  return status?.toUpperCase() === 'SUCCESS';
}

async function readSnapchatResponse(res: Response): Promise<SnapchatResponse> {
  try {
    return await res.json() as SnapchatResponse;
  } catch {
    return { message: res.statusText };
  }
}

function snapErrorMessage(data: SnapchatResponse, fallback: string): string {
  return data.display_message ?? data.debug_message ?? data.message ?? data.error_code ?? fallback;
}

function fileNameFromUrl(value: string, kind: MediaAttachment['kind']): string {
  const pathName = new URL(value).pathname;
  const fileName = basename(pathName);
  if (fileName && fileName.includes('.')) return fileName;
  return kind === 'video' ? 'snapchat-video.mp4' : 'snapchat-image.jpg';
}

function guessMime(file: string, kind: MediaAttachment['kind']): string {
  switch (extname(file).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    case '.mp4':
      return 'video/mp4';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    default:
      return kind === 'video' ? 'video/mp4' : 'image/jpeg';
  }
}

function normalizeMime(value: string | null, kind: MediaAttachment['kind']): string | undefined {
  const mime = value?.split(';')[0]?.trim().toLowerCase();
  if (mime?.startsWith(`${kind}/`)) return mime;
  return undefined;
}

function redactSecrets(message: string, secrets: Array<string | undefined>): string {
  let redacted = message;
  for (const secret of secrets) {
    if (secret) redacted = redacted.replaceAll(secret, '[redacted]');
  }
  return redacted;
}
