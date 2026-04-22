import { autoSetup } from './setup-helpers.js';

// Organic social posting — separate concern from ads (promo/*) and
// investor outreach. One Post definition adapts to every connected
// platform (truncation, hashtag placement, media requirements).

export type MediaKind = 'image' | 'video' | 'gif';

export interface MediaAttachment {
  file: string;                // path or URL
  kind: MediaKind;
  alt?: string;                // accessibility text
  thumbnail?: string;          // video thumbnail (auto-extracted if omitted)
  durationSec?: number;        // videos only
}

export interface SocialPost {
  body: string;                // core message
  title?: string;              // long-form platforms (LinkedIn articles, Dev.to, Hashnode)
  hashtags?: string[];         // without '#' — adapters place them appropriately
  link?: string;               // CTA URL; adapters decide whether to append or use a link-preview
  media?: MediaAttachment[];
  schedule?: Date;             // publish at a specific time; if omitted, post immediately
  // Per-platform overrides. Lets you tune one message without rewriting the base.
  overrides?: Record<string, Partial<SocialPost>>;
}

export interface PostResult {
  id: string;                  // platform-native post id
  url: string;                 // link to the post
  platform: string;
  publishedAt: string;         // ISO; may be in the future for scheduled posts
}

export interface EngagementMetrics {
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;             // link clicks
  reach?: number;
  engagementRate?: number;
}

export interface SocialPlatform<Config = unknown> {
  id: string;                  // e.g. 'social-x'
  label: string;
  // What the platform requires to accept a post. Helps the CLI tell a
  // user "you need a video for tiktok, here's a drop-in conversion".
  requires: {
    media?: MediaKind[];       // undefined = optional; ['video'] = must have
    maxBodyChars?: number;
    maxHashtags?: number;
    hashtagsInBody?: boolean;  // true = hashtags consume char budget
  };
  connect(ctx: { secret(k: string): string | undefined; log(m: string): void }, config: Config): Promise<{ accountId: string }>;
  post(ctx: { secret(k: string): string | undefined; log(m: string): void; dryRun: boolean }, post: SocialPost, config: Config): Promise<PostResult>;
  metrics?(postId: string, config: Config): Promise<EngagementMetrics>;
  delete?(postId: string, config: Config): Promise<void>;
  setup?(ctx: import('./setup.js').SetupContext): Promise<import('./setup.js').SetupResult<Config>>;
}

export function defineSocial<Config>(s: SocialPlatform<Config>): SocialPlatform<Config> {
  return autoSetup(s);
}

const socialRegistry = new Map<string, SocialPlatform<any>>();

export function registerSocialPlatform(s: SocialPlatform<any>): void {
  if (socialRegistry.has(s.id)) throw new Error(`Social platform already registered: ${s.id}`);
  socialRegistry.set(s.id, s);
}

export function getSocialPlatform(id: string): SocialPlatform<any> | undefined {
  return socialRegistry.get(id);
}

export function listSocialPlatforms(): SocialPlatform<any>[] {
  return [...socialRegistry.values()];
}

// Helper adapters use to fit a post into their constraints. Keeps the
// hashtag-placement logic in one place.
export function adaptPost(post: SocialPost, platform: SocialPlatform): { body: string; hashtags: string[] } {
  const override = post.overrides?.[platform.id] ?? {};
  const body = override.body ?? post.body;
  const hashtags = (override.hashtags ?? post.hashtags ?? []).slice(0, platform.requires.maxHashtags ?? 30);

  const tagline = hashtags.map((h) => `#${h}`).join(' ');
  let finalBody = body;

  if (platform.requires.hashtagsInBody) {
    const max = platform.requires.maxBodyChars ?? Infinity;
    const withTags = tagline ? `${body} ${tagline}` : body;
    finalBody = withTags.length > max ? withTags.slice(0, max - 1) + '…' : withTags;
    return { body: finalBody, hashtags: [] };
  }
  const max = platform.requires.maxBodyChars ?? Infinity;
  if (finalBody.length > max) finalBody = finalBody.slice(0, max - 1) + '…';
  return { body: finalBody, hashtags };
}
