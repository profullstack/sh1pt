import { defineSocial, oauthSetup, type SocialPost } from '@profullstack/sh1pt-core';

// CodeNewbie Community — runs on Forem. Functionally the same API as
// social-forem pointed at community.codenewbie.org, but kept as its
// own adapter so the badge + setup flow are explicit.
interface Config {
  published?: boolean;          // false = draft
  canonicalUrl?: string;
}

const CODENEWBIE_API_URL = 'https://community.codenewbie.org/api/articles';
const CODENEWBIE_HOME = 'https://community.codenewbie.org/';

export default defineSocial<Config>({
  id: 'social-codenewbie',
  label: 'CodeNewbie',
  requires: { maxHashtags: 4, hashtagsInBody: false },
  async connect(ctx) {
    if (!ctx.secret('CODENEWBIE_API_KEY')) throw new Error('CODENEWBIE_API_KEY not in vault');
    return { accountId: 'codenewbie' };
  },
  async post(ctx, post, config) {
    if (!post.title) throw new Error('CodeNewbie requires a title');
    const apiKey = ctx.secret('CODENEWBIE_API_KEY');
    if (!apiKey) throw new Error('CODENEWBIE_API_KEY not in vault');
    ctx.log(`codenewbie article · "${post.title}"`);
    if (ctx.dryRun) return { id: 'dry-run', url: CODENEWBIE_HOME, platform: 'codenewbie', publishedAt: new Date().toISOString() };

    const res = await fetch(CODENEWBIE_API_URL, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ article: formatCodeNewbieArticle(post, config) }),
    });
    if (!res.ok) throw new Error(await readCodeNewbieError(res));

    const article = await res.json() as CodeNewbieArticle;
    if (article.id === undefined) throw new Error('CodeNewbie publish response did not include an article id');
    return {
      id: String(article.id),
      url: article.url ?? CODENEWBIE_HOME,
      platform: 'codenewbie',
      publishedAt: new Date(article.published_at ?? article.created_at ?? Date.now()).toISOString(),
    };
  },

  setup: oauthSetup({
    secretKey: "CODENEWBIE_API_KEY",
    label: "CodeNewbie",
    vendorDocUrl: "https://www.codenewbie.org/",
    steps: [
      "CodeNewbie runs on Forem; use a Forem API key from their instance",
    ],
  }),
});

interface CodeNewbieArticle {
  id?: number | string;
  url?: string;
  created_at?: string;
  published_at?: string | null;
}

function formatCodeNewbieArticle(post: SocialPost, config: Config): Record<string, unknown> {
  const link = post.link ? `\n\n${post.link}` : '';
  return {
    title: post.title,
    body_markdown: `${post.body}${link}`,
    published: config.published ?? false,
    tags: (post.hashtags ?? []).slice(0, 4),
    canonical_url: config.canonicalUrl,
  };
}

async function readCodeNewbieError(res: Response): Promise<string> {
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
