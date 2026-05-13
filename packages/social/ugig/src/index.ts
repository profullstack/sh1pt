import { defineSocial, tokenSetup, type SocialPost } from '@profullstack/sh1pt-core';

// ugig.net — Marketplace for AI-assisted professionals.
// Auth: API key via X-API-Key, or a legacy Supabase bearer token.
// Posts map to the public uGig community feed API.
//
// API base: https://ugig.net/api
// Docs:     https://ugig.net/openapi.json
//
// Rate limits: not publicly documented; avoid bursting > ~10 req/min.

const UGIG_API = 'https://ugig.net/api';
const UGIG_WEB = 'https://ugig.net';
const MAX_CONTENT_CHARS = 5_000;
const MAX_TAGS = 10;
const MAX_TAG_CHARS = 50;

type UgigPostType = 'text' | 'link' | 'showcase';

interface Config {
  /** ugig.net username for logging/display (e.g. 'nexus_ai') */
  username?: string;
  /** Override the API base for tests or self-hosted deployments. */
  apiBaseUrl?: string;
  /** Default post type; if omitted, link posts are inferred from post.link. */
  postType?: UgigPostType;
  /** @deprecated uGig no longer exposes the prompts marketplace endpoint. */
  defaultPriceSats?: number;
  /** @deprecated uGig no longer exposes the prompts marketplace endpoint. */
  defaultCategory?: string;
}

export default defineSocial<Config>({
  id: 'social-ugig',
  label: 'uGig',
  requires: { maxBodyChars: MAX_CONTENT_CHARS, maxHashtags: MAX_TAGS, hashtagsInBody: false },

  async connect(ctx, config) {
    const res = await fetch(`${apiBase(config)}/profile`, {
      headers: authHeaders(ctx),
    });
    if (!res.ok) throw new Error(`ugig auth check failed: HTTP ${res.status} - ${await readUgigError(res)}`);
    const data = await res.json() as { profile?: { username?: string; id?: string } };
    const username = data.profile?.username ?? config.username ?? 'ugig';
    ctx.log(`ugig connected · @${username}`);
    return { accountId: username };
  },

  async post(ctx, post, config) {
    const payload = formatUgigPost(post, config);
    const headers = authHeaders(ctx);

    ctx.log(`ugig post · ${payload.post_type} · ${payload.content.length} chars · ${payload.tags.length} tags`);

    if (ctx.dryRun) {
      return { id: 'dry-run', url: `${UGIG_WEB}/feed`, platform: 'ugig', publishedAt: new Date().toISOString() };
    }

    const res = await fetch(`${apiBase(config)}/posts`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`ugig post failed: HTTP ${res.status} - ${await readUgigError(res)}`);
    }

    const data = await res.json() as { post?: UgigPost };
    const createdPost = data.post;
    if (!createdPost?.id) throw new Error('ugig publish response did not include a post id');

    const url = `${UGIG_WEB}/post/${createdPost.id}`;
    ctx.log(`ugig published · ${url}`);
    return {
      id: createdPost.id,
      url,
      platform: 'ugig',
      publishedAt: new Date(createdPost.created_at ?? Date.now()).toISOString(),
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'UGIG_API_KEY',
    label: 'uGig',
    vendorDocUrl: 'https://ugig.net/openapi.json',
    steps: [
      'Register or sign in at https://ugig.net',
      'Create an API key and store it as UGIG_API_KEY in your sh1pt secrets vault',
      'Legacy Supabase bearer tokens stored as UGIG_TOKEN are also accepted',
      'Posts publish to POST https://ugig.net/api/posts with content, url, post_type, and tags',
    ],
  }),
});

interface SecretContext {
  secret(k: string): string | undefined;
}

interface UgigPost {
  id?: string;
  created_at?: string;
}

interface UgigPostPayload {
  content: string;
  url: string | null;
  post_type: UgigPostType;
  tags: string[];
}

function authHeaders(ctx: SecretContext): Record<string, string> {
  const apiKey = ctx.secret('UGIG_API_KEY');
  if (apiKey) return { 'X-API-Key': apiKey };

  const token = ctx.secret('UGIG_TOKEN');
  if (token) return { Authorization: `Bearer ${token}` };

  throw new Error('UGIG_API_KEY not in vault - run: sh1pt secret set UGIG_API_KEY <api-key>');
}

function formatUgigPost(post: SocialPost, config: Config): UgigPostPayload {
  const content = formatContent(post);
  const tags = (post.hashtags ?? [])
    .map((tag) => tag.replace(/^#+/, '').trim())
    .filter(Boolean)
    .slice(0, MAX_TAGS)
    .map((tag) => tag.slice(0, MAX_TAG_CHARS));

  return {
    content,
    url: post.link ?? null,
    post_type: config.postType ?? (post.link ? 'link' : 'text'),
    tags,
  };
}

function formatContent(post: SocialPost): string {
  const parts = [post.title, post.body]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  const content = parts.join('\n\n');
  if (!content) throw new Error('uGig posts require non-empty content');
  return content.slice(0, MAX_CONTENT_CHARS);
}

function apiBase(config: Config): string {
  return (config.apiBaseUrl ?? UGIG_API).replace(/\/+$/, '');
}

async function readUgigError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  if (!text) return res.statusText || 'Unknown uGig API error';
  try {
    const data = JSON.parse(text) as { error?: string; message?: string };
    return data.error ?? data.message ?? text;
  } catch {
    return text;
  }
}
