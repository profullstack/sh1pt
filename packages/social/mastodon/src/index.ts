import { defineSocial, oauthSetup, type SocialPost } from '@profullstack/sh1pt-core';

// Mastodon — federated. Each instance is its own server; same API.
// POST /api/v1/statuses with access token scoped to 'write:statuses'.
interface Config {
  instance: string;            // e.g. 'mastodon.social' or 'fosstodon.org'
  visibility?: 'public' | 'unlisted' | 'private' | 'direct';
}

interface MastodonStatusResponse {
  id?: string;
  url?: string;
  uri?: string;
  created_at?: string;
}

export default defineSocial<Config>({
  id: 'social-mastodon',
  label: 'Mastodon (Fediverse)',
  requires: { maxBodyChars: 500, maxHashtags: 20, hashtagsInBody: true },
  async connect(ctx, config) {
    const instance = normalizeInstance(config.instance);
    if (!ctx.secret(secretKeyForInstance(instance))) {
      throw new Error(`Mastodon token for ${instance} not in vault`);
    }
    return { accountId: instance };
  },
  async post(ctx, post, config) {
    if (post.media?.length) throw new Error('Mastodon media uploads are not implemented yet');
    const instance = normalizeInstance(config.instance);
    const token = ctx.secret(secretKeyForInstance(instance));
    if (!token) throw new Error(`Mastodon token for ${instance} not in vault`);
    const status = formatMastodonStatus(post);
    ctx.log(`mastodon post · ${instance} · ${status.length} chars`);
    if (ctx.dryRun) return { id: 'dry-run', url: `https://${instance}/`, platform: 'mastodon', publishedAt: new Date().toISOString() };

    const res = await fetch(`https://${instance}/api/v1/statuses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        status,
        visibility: config.visibility ?? 'public',
      }),
    });
    if (!res.ok) throw new Error(await readMastodonError(res));

    const data = await parseStatusResponse(res);
    if (!data.id) throw new Error('Mastodon status response did not include a status id');
    return {
      id: data.id,
      url: data.url ?? data.uri ?? `https://${instance}/`,
      platform: 'mastodon',
      publishedAt: new Date(data.created_at ?? Date.now()).toISOString(),
    };
  },

  setup: oauthSetup({
    secretKey: "MASTODON_ACCESS_TOKEN",
    label: "Mastodon",
    vendorDocUrl: "https://docs.joinmastodon.org/client/token/",
    steps: [
      "Open your Mastodon instance -> Preferences -> Development -> New Application",
      "Scopes: write:statuses write:media read:accounts",
      "Copy the access token shown after creation",
    ],
  }),
});

function formatMastodonStatus(post: SocialPost): string {
  const body = post.link ? `${post.body}\n\n${post.link}` : post.body;
  const tags = (post.hashtags ?? []).slice(0, 20).map((tag) => `#${tag}`).join(' ');
  const status = tags ? `${body} ${tags}` : body;
  return status.length > 500 ? `${status.slice(0, 497)}...` : status;
}

function normalizeInstance(instance: string): string {
  return instance.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function secretKeyForInstance(instance: string): string {
  return `MASTODON_TOKEN_${instance.replace(/\./g, '_').toUpperCase()}`;
}

async function parseStatusResponse(res: Response): Promise<MastodonStatusResponse> {
  return await res.json() as MastodonStatusResponse;
}

async function readMastodonError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  if (!text) return res.statusText;
  try {
    const data = JSON.parse(text) as { error?: string };
    return data.error ?? text;
  } catch {
    return text;
  }
}
