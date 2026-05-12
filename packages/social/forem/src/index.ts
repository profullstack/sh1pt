import { defineSocial, oauthSetup, type SocialPost } from '@profullstack/sh1pt-core';

// Forem — the open-source platform DEV Community runs on, used by many
// self-hosted communities (CodeNewbie, etc.). Same API shape as dev.to,
// different host. Point this adapter at any Forem instance.
interface Config {
  host: string;                 // e.g. 'community.codenewbie.org'
  published?: boolean;          // false = draft
  canonicalUrl?: string;
  organizationId?: number;
}

export default defineSocial<Config>({
  id: 'social-forem',
  label: 'Forem (self-hosted)',
  requires: { maxHashtags: 4, hashtagsInBody: false },
  async connect(ctx, config) {
    const host = normalizeHost(config.host);
    const key = secretKeyForHost(host);
    if (!ctx.secret(key)) throw new Error(`${key} not in vault`);
    return { accountId: host };
  },
  async post(ctx, post, config) {
    if (!post.title) throw new Error('Forem requires a title');
    const host = normalizeHost(config.host);
    const key = secretKeyForHost(host);
    const apiKey = ctx.secret(key);
    if (!apiKey) throw new Error(`${key} not in vault`);
    ctx.log(`forem article · ${host} · "${post.title}"`);
    if (ctx.dryRun) return { id: 'dry-run', url: `https://${host}/`, platform: 'forem', publishedAt: new Date().toISOString() };

    const res = await fetch(`https://${host}/api/articles`, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ article: formatForemArticle(post, config) }),
    });
    if (!res.ok) throw new Error(await readForemError(res));

    const article = await res.json() as ForemArticle;
    if (article.id === undefined) throw new Error('Forem publish response did not include an article id');
    return {
      id: String(article.id),
      url: article.url ?? `https://${host}/`,
      platform: 'forem',
      publishedAt: new Date(article.published_at ?? article.created_at ?? Date.now()).toISOString(),
    };
  },

  setup: oauthSetup({
    secretKey: "FOREM_API_KEY",
    label: "Forem (self-hosted DEV)",
    vendorDocUrl: "https://dev.to/settings/extensions",
    steps: [
      "On your Forem instance -> Settings -> Extensions -> API Keys -> Generate",
      "Note: host URL needs to be in your sh1pt.config.ts (e.g. https://my.forem.com)",
    ],
  }),
});

interface ForemArticle {
  id?: number | string;
  url?: string;
  created_at?: string;
  published_at?: string | null;
}

function formatForemArticle(post: SocialPost, config: Config): Record<string, unknown> {
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

function normalizeHost(host: string): string {
  return host.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function secretKeyForHost(host: string): string {
  return `FOREM_API_KEY_${host.replace(/\W/g, '_').toUpperCase()}`;
}

async function readForemError(res: Response): Promise<string> {
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
