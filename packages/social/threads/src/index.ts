import { defineSocial, oauthSetup, type MediaAttachment, type SocialPost } from '@profullstack/sh1pt-core';

// Threads (Meta). Public API launched 2024. Same auth pattern as
// Instagram / Facebook Graph but a distinct endpoint surface.
interface Config {
  threadsUserId: string;
  apiVersion?: string;
}

interface ThreadsResponse {
  id?: string;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
}

export default defineSocial<Config>({
  id: 'social-threads',
  label: 'Threads',
  requires: { maxBodyChars: 500, maxHashtags: 10, hashtagsInBody: true },
  async connect(ctx, config) {
    if (!ctx.secret('THREADS_ACCESS_TOKEN')) throw new Error('THREADS_ACCESS_TOKEN not in vault');
    return { accountId: config.threadsUserId };
  },
  async post(ctx, post, config) {
    const token = ctx.secret('THREADS_ACCESS_TOKEN');
    if (!token) throw new Error('THREADS_ACCESS_TOKEN not in vault');
    ctx.log(`threads post · ${post.body.length} chars`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://threads.net/', platform: 'threads', publishedAt: new Date().toISOString() };

    const container = await createContainer(config, token, post);
    if (!container.id) throw new Error('Threads container response did not include an id');
    const published = await publishContainer(config, token, container.id);
    if (!published.id) throw new Error('Threads publish response did not include an id');

    return {
      id: published.id,
      url: 'https://www.threads.net/',
      platform: 'threads',
      publishedAt: new Date().toISOString(),
    };
  },

  setup: oauthSetup({
    secretKey: "THREADS_ACCESS_TOKEN",
    label: "Threads",
    vendorDocUrl: "https://developers.facebook.com/docs/threads",
    steps: [
      "Open developers.facebook.com \u2192 Apps \u2192 Create App",
      "Add the Threads API product and configure redirect URIs",
      "Complete the OAuth flow for the target Threads account",
    ],
  }),
});

function endpoint(config: Config, edge: 'threads' | 'threads_publish'): string {
  const version = config.apiVersion ?? 'v1.0';
  return `https://graph.threads.net/${version}/${encodeURIComponent(config.threadsUserId)}/${edge}`;
}

async function createContainer(config: Config, token: string, post: SocialPost): Promise<ThreadsResponse> {
  const res = await fetch(endpoint(config, 'threads'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: createContainerBody(token, post),
  });
  const data = await readThreadsResponse(res);
  if (!res.ok) throw new Error(threadsErrorMessage(data, res.statusText));
  return data;
}

async function publishContainer(config: Config, token: string, creationId: string): Promise<ThreadsResponse> {
  const body = new URLSearchParams({
    creation_id: creationId,
    access_token: token,
  });
  const res = await fetch(endpoint(config, 'threads_publish'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await readThreadsResponse(res);
  if (!res.ok) throw new Error(threadsErrorMessage(data, res.statusText));
  return data;
}

function createContainerBody(token: string, post: SocialPost): URLSearchParams {
  const body = new URLSearchParams({
    media_type: mediaType(post.media),
    text: formatText(post),
    access_token: token,
  });
  const media = firstMedia(post.media);
  if (media?.kind === 'image') body.set('image_url', publicMediaUrl(media));
  if (media?.kind === 'video') body.set('video_url', publicMediaUrl(media));
  return body;
}

function mediaType(media: MediaAttachment[] | undefined): 'TEXT' | 'IMAGE' | 'VIDEO' {
  const selected = firstMedia(media);
  if (!selected) return 'TEXT';
  if (selected.kind === 'image') return 'IMAGE';
  if (selected.kind === 'video') return 'VIDEO';
  throw new Error('Threads supports text, image, and video posts only');
}

function firstMedia(media: MediaAttachment[] | undefined): MediaAttachment | undefined {
  return media?.find((item) => item.kind === 'image' || item.kind === 'video' || item.kind === 'gif');
}

function publicMediaUrl(media: MediaAttachment): string {
  if (!/^https?:\/\//.test(media.file)) {
    throw new Error('Threads media posts require media.file to be a public http(s) URL');
  }
  return media.file;
}

function formatText(post: SocialPost): string {
  const link = post.link ? `\n${post.link}` : '';
  const hashtags = (post.hashtags ?? []).slice(0, 10).map((tag) => `#${tag}`).join(' ');
  const text = `${post.body}${link}${hashtags ? ` ${hashtags}` : ''}`;
  return text.slice(0, 500);
}

async function readThreadsResponse(res: Response): Promise<ThreadsResponse> {
  try {
    return await res.json() as ThreadsResponse;
  } catch {
    return { error: { message: res.statusText } };
  }
}

function threadsErrorMessage(data: ThreadsResponse, fallback: string): string {
  return data.error?.message ?? fallback;
}
