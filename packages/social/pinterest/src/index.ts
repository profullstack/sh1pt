import { defineSocial, oauthSetup, type MediaAttachment, type SocialPost } from '@profullstack/sh1pt-core';

// Pinterest API v5. OAuth 2.0 with PKCE; pins live on boards owned by the
// authenticated user or business account.
interface Config {
  boardId: string;
  boardSectionId?: string;
  isStandard?: boolean;
  videoMediaId?: string;
  coverImageUrl?: string;
}

interface PinterestPinResponse {
  id?: string;
  created_at?: string;
  code?: number;
  message?: string;
}

export default defineSocial<Config>({
  id: 'social-pinterest',
  label: 'Pinterest',
  requires: { media: ['image', 'video'], maxBodyChars: 500, maxHashtags: 20, hashtagsInBody: true },

  async connect(ctx, config) {
    if (!ctx.secret('PINTEREST_ACCESS_TOKEN')) throw new Error('PINTEREST_ACCESS_TOKEN not in vault');
    return { accountId: config.boardId };
  },

  async post(ctx, post, config) {
    if (!post.media?.length) {
      throw new Error('Pinterest requires at least one image or video');
    }
    const token = ctx.secret('PINTEREST_ACCESS_TOKEN');
    if (!token) throw new Error('PINTEREST_ACCESS_TOKEN not in vault');
    ctx.log(`pinterest pin · board=${config.boardId} · media=${post.media.length}`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://pinterest.com/', platform: 'pinterest', publishedAt: new Date().toISOString() };

    const res = await fetch('https://api.pinterest.com/v5/pins', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(formatPinterestPin(post, config)),
    });
    const data = await readPinterestResponse(res);
    if (!res.ok) throw new Error(data.message ?? res.statusText);
    if (!data.id) throw new Error('Pinterest create Pin response did not include a Pin id');

    return {
      id: data.id,
      url: `https://www.pinterest.com/pin/${data.id}/`,
      platform: 'pinterest',
      publishedAt: pinterestTimestamp(data.created_at),
    };
  },

  setup: oauthSetup({
    secretKey: 'PINTEREST_ACCESS_TOKEN',
    label: 'Pinterest',
    vendorDocUrl: 'https://developers.pinterest.com/docs/api/v5/',
    steps: [
      'Open developers.pinterest.com → Apps → Create app',
      'Add redirect URI http://127.0.0.1:8765/callback and request scopes: pins:read, pins:write, boards:read',
      'Complete the OAuth flow for the target account and copy the access token',
    ],
    // Loopback PKCE — kicks in when SH1PT_PINTEREST_CLIENT_ID is set
    // (CLI publisher registers one app, ships the public client id via env).
    ...(process.env.SH1PT_PINTEREST_CLIENT_ID
      ? {
          loopback: {
            clientId: process.env.SH1PT_PINTEREST_CLIENT_ID,
            authUrl: 'https://www.pinterest.com/oauth/',
            tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
            scopes: ['pins:read', 'pins:write', 'boards:read', 'boards:write', 'user_accounts:read'],
          },
        }
      : {}),
  }),
});

function formatPinterestPin(post: SocialPost, config: Config): Record<string, unknown> {
  const media = firstSupportedMedia(post.media ?? [], config);
  return {
    board_id: config.boardId,
    board_section_id: config.boardSectionId,
    title: post.title,
    description: formatDescription(post),
    link: post.link,
    alt_text: media.kind === 'image' ? media.alt : undefined,
    media_source: mediaSource(media, config),
  };
}

function firstSupportedMedia(media: MediaAttachment[], config: Config): MediaAttachment {
  const selected = media.find((item) => item.kind === 'image' || item.kind === 'video');
  if (!selected) throw new Error('Pinterest requires an image or video media attachment');
  if (selected.kind === 'video' && (!config.videoMediaId || !config.coverImageUrl)) {
    throw new Error('Pinterest video Pins require config.videoMediaId and config.coverImageUrl from the media upload flow');
  }
  return selected;
}

function mediaSource(media: MediaAttachment, config: Config): Record<string, unknown> {
  if (media.kind === 'video') {
    return {
      source_type: 'video_id',
      media_id: config.videoMediaId,
      cover_image_url: config.coverImageUrl,
    };
  }

  if (!/^https?:\/\//.test(media.file)) {
    throw new Error('Pinterest image Pins require media.file to be an http(s) image URL');
  }
  return {
    source_type: 'image_url',
    url: media.file,
    is_standard: config.isStandard ?? true,
  };
}

function formatDescription(post: SocialPost): string {
  const hashtags = (post.hashtags ?? []).slice(0, 20).map((tag) => `#${tag}`).join(' ');
  const description = hashtags ? `${post.body} ${hashtags}` : post.body;
  return description.slice(0, 500);
}

async function readPinterestResponse(res: Response): Promise<PinterestPinResponse> {
  try {
    return await res.json() as PinterestPinResponse;
  } catch {
    return { message: res.statusText };
  }
}

function pinterestTimestamp(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  return new Date(hasTimezone ? value : `${value}Z`).toISOString();
}
