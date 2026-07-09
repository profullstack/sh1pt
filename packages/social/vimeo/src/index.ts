import { defineSocial, oauthSetup, type MediaAttachment, type SocialPost } from '@profullstack/sh1pt-core';

// Vimeo API. OAuth 2.0 with personal-access-token convenience for single-
// user automation. This adapter uses pull uploads so sh1pt can publish from
// public video URLs without handling local-file chunks or upload sessions.
interface Config {
  userId?: string;
  privacyView?: 'anybody' | 'contacts' | 'disable' | 'nobody' | 'password' | 'unlisted' | 'users';
  password?: string;
  folderUri?: string;
  baseUrl?: string;
}

interface VimeoVideoResponse {
  uri?: string;
  link?: string;
  name?: string;
  created_time?: string;
}

interface VimeoAccountResponse {
  uri?: string;
  link?: string;
  name?: string;
}

interface VimeoErrorResponse {
  error?: string;
  message?: string;
  developer_message?: string;
  invalid_parameters?: Array<{ field?: string; error?: string; message?: string }>;
}

export default defineSocial<Config>({
  id: 'social-vimeo',
  label: 'Vimeo',
  requires: { media: ['video'], maxBodyChars: 5000, maxHashtags: 20, hashtagsInBody: false },

  async connect(ctx, config) {
    const token = requireToken(ctx);
    const response = await fetch(`${apiBase(config)}/me`, {
      headers: authHeaders(token),
    });
    const data = await readJson<VimeoAccountResponse | VimeoErrorResponse>(response);
    if (!response.ok) {
      throw new Error(`Vimeo connect failed: ${vimeoErrorMessage(data, response.statusText, token)}`);
    }
    const account = data as VimeoAccountResponse;
    return { accountId: extractId(account, 'users') ?? config.userId ?? account.link ?? 'me' };
  },

  async post(ctx, post, config) {
    const media = firstVideo(post.media);
    if (!media) throw new Error('Vimeo requires a video upload');
    const link = publicVideoUrl(media);
    if (config.privacyView === 'password' && !config.password) {
      throw new Error('Vimeo privacyView=password requires config.password');
    }

    ctx.log(`vimeo upload · privacy=${config.privacyView ?? 'anybody'} · ${post.body.length} chars description`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://vimeo.com/', platform: 'vimeo', publishedAt: new Date().toISOString() };

    const token = requireToken(ctx);
    const response = await fetch(`${apiBase(config)}/me/videos`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(createVideoBody(post, link, config)),
    });
    const data = await readJson<VimeoVideoResponse | VimeoErrorResponse>(response);
    if (!response.ok) {
      throw new Error(`Vimeo upload failed: ${vimeoErrorMessage(data, response.statusText, token)}`);
    }

    const video = data as VimeoVideoResponse;
    const id = extractId(video, 'videos');
    if (!id) throw new Error('Vimeo upload response did not include a video id');

    return {
      id,
      url: video.link ?? `https://vimeo.com/${id}`,
      platform: 'vimeo',
      publishedAt: video.created_time ?? new Date().toISOString(),
    };
  },

  setup: oauthSetup({
    secretKey: 'VIMEO_ACCESS_TOKEN',
    label: 'Vimeo',
    vendorDocUrl: 'https://developer.vimeo.com/api/authentication',
    steps: [
      'Open developer.vimeo.com/apps → Create an app',
      'Add callback URL http://127.0.0.1:8765/callback and request scopes: public, private, video_files, upload, edit',
      'Or generate a personal access token if you only have one publisher',
    ],
    ...(process.env.SH1PT_VIMEO_CLIENT_ID
      ? {
          loopback: {
            clientId: process.env.SH1PT_VIMEO_CLIENT_ID,
            authUrl: 'https://api.vimeo.com/oauth/authorize',
            tokenUrl: 'https://api.vimeo.com/oauth/access_token',
            scopes: ['public', 'private', 'video_files', 'upload', 'edit'],
          },
        }
      : {}),
  }),
});

function requireToken(ctx: { secret(k: string): string | undefined }): string {
  const token = ctx.secret('VIMEO_ACCESS_TOKEN');
  if (!token) throw new Error('VIMEO_ACCESS_TOKEN not in vault — run `sh1pt secret set VIMEO_ACCESS_TOKEN`');
  return token;
}

function authHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
    'content-type': 'application/json',
  };
}

function apiBase(config: Config): string {
  return (config.baseUrl ?? 'https://api.vimeo.com').replace(/\/+$/, '');
}

function firstVideo(media: MediaAttachment[] | undefined): MediaAttachment | undefined {
  return media?.find((item) => item.kind === 'video');
}

function publicVideoUrl(media: MediaAttachment): string {
  let url: URL;
  try {
    url = new URL(media.file);
  } catch {
    throw new Error('Vimeo pull uploads require media.file to be a public http(s) video URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Vimeo pull uploads require media.file to be a public http(s) video URL');
  }
  return url.toString();
}

function createVideoBody(post: SocialPost, link: string, config: Config): Record<string, unknown> {
  return {
    name: videoName(post),
    description: videoDescription(post),
    upload: {
      approach: 'pull',
      link,
    },
    ...(config.privacyView ? { privacy: { view: config.privacyView, ...(config.password ? { password: config.password } : {}) } } : {}),
    ...(config.folderUri ? { folder_uri: config.folderUri } : {}),
  };
}

function videoName(post: SocialPost): string {
  const title = post.title?.trim() || post.body.split(/\r?\n/, 1)[0]?.trim() || 'Untitled sh1pt video';
  return truncate(title, 128);
}

function videoDescription(post: SocialPost): string {
  const parts = [
    post.body.trim(),
    post.link?.trim(),
    ...(post.hashtags?.map((tag) => `#${tag.replace(/^#/, '')}`) ?? []),
  ].filter(Boolean);
  return truncate(parts.join('\n\n'), 5000);
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    return {} as T;
  }
}

function extractId(data: { uri?: string; link?: string }, resource: 'users' | 'videos'): string | undefined {
  const uriMatch = data.uri?.match(new RegExp(`/${resource}/([^/?#]+)`));
  if (uriMatch?.[1]) return uriMatch[1];

  if (resource === 'videos') {
    const linkMatch = data.link?.match(/vimeo\.com\/(?:video\/)?([^/?#]+)/);
    if (linkMatch?.[1]) return linkMatch[1];
  }
  return undefined;
}

function vimeoErrorMessage(data: VimeoErrorResponse | unknown, fallback: string, token: string): string {
  const err = data as VimeoErrorResponse;
  const invalid = err.invalid_parameters
    ?.map((item) => [item.field, item.error ?? item.message].filter(Boolean).join(': '))
    .filter(Boolean)
    .join('; ');
  return redact([err.developer_message, err.message, err.error, invalid, fallback].find(Boolean) ?? 'unknown error', token);
}

function redact(value: string, token: string): string {
  return token ? value.split(token).join('[redacted]') : value;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
