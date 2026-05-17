import { defineSocial, oauthSetup, type SocialPost } from '@profullstack/sh1pt-core';

// DEV Community (dev.to) — clean REST API at dev.to/api. Articles are
// markdown; tags are native (not hashtags). Auth: API key from user
// settings.
interface Config {
  organizationId?: number;      // post on behalf of an org
  published?: boolean;          // false = draft
  canonicalUrl?: string;        // set when cross-posting from your own blog
}

export default defineSocial<Config>({
  id: 'social-devto',
  label: 'DEV Community (dev.to)',
  requires: { maxHashtags: 4, hashtagsInBody: false },    // DEV uses "tags", max 4
  async connect(ctx) {
    if (!ctx.secret('DEVTO_API_KEY')) throw new Error('DEVTO_API_KEY not in vault — run: sh1pt secret set DEVTO_API_KEY <api-key>');
    return { accountId: 'devto' };
  },
  async post(ctx, post, config) {
    if (!post.title) throw new Error('dev.to requires a title');
    const apiKey = ctx.secret('DEVTO_API_KEY');
    if (!apiKey) throw new Error('DEVTO_API_KEY not in vault — run: sh1pt secret set DEVTO_API_KEY <api-key>');
    ctx.log(`dev.to article · "${post.title}"`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://dev.to/', platform: 'devto', publishedAt: new Date().toISOString() };

    const res = await fetch('https://dev.to/api/articles', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ article: formatDevArticle(post, config) }),
    });
    if (!res.ok) {
      throw new Error(await readDevtoError(res));
    }

    const article = await res.json() as DevtoArticle;
    return {
      id: String(article.id),
      url: article.url ?? 'https://dev.to/',
      platform: 'devto',
      publishedAt: new Date(article.published_at ?? article.created_at ?? Date.now()).toISOString(),
    };
  },

  setup: oauthSetup({
    secretKey: "DEVTO_API_KEY",
    label: "DEV.to",
    vendorDocUrl: "https://dev.to/settings/extensions",
    steps: [
      "Open dev.to/settings/extensions \u2192 DEV Community API Keys",
      "Generate a new API key \u2192 copy it",
    ],
  }),
});

interface DevtoArticle {
  id: number;
  url?: string;
  created_at?: string;
  published_at?: string | null;
}

function formatDevArticle(post: SocialPost, config: Config): Record<string, unknown> {
  const link = post.link ? `\n\n${post.link}` : '';
  return {
    title: post.title,
    body_markdown: `${post.body}${link}`,
    published: config.published ?? false,
    tags: (post.hashtags ?? []).slice(0, 4),
    canonical_url: config.canonicalUrl,
    organization_id: config.organizationId,
  };
}

async function readDevtoError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  if (!text) return res.statusText;
  try {
    const data = JSON.parse(text) as { error?: string; errors?: string[] | string };
    if (Array.isArray(data.errors)) return data.errors.join('; ');
    return data.error ?? data.errors ?? text;
  } catch {
    return text;
  }
}
