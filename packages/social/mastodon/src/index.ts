import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// Mastodon — federated. Each instance is its own server; same API.
// POST /api/v1/statuses with access token scoped to 'write:statuses'.
interface Config {
  instance: string;            // e.g. 'mastodon.social' or 'fosstodon.org'
  visibility?: 'public' | 'unlisted' | 'private' | 'direct';
}

export default defineSocial<Config>({
  id: 'social-mastodon',
  label: 'Mastodon (Fediverse)',
  requires: { maxBodyChars: 500, maxHashtags: 20, hashtagsInBody: true },
  async connect(ctx, config) {
    if (!ctx.secret(`MASTODON_TOKEN_${config.instance.replace(/\./g, '_').toUpperCase()}`)) {
      throw new Error(`Mastodon token for ${config.instance} not in vault`);
    }
    return { accountId: config.instance };
  },
  async post(ctx, post, config) {
    ctx.log(`mastodon post · ${config.instance} · ${post.body.length} chars`);
    if (ctx.dryRun) return { id: 'dry-run', url: `https://${config.instance}/`, platform: 'mastodon', publishedAt: new Date().toISOString() };
    // TODO: POST https://${instance}/api/v1/statuses with { status, visibility, media_ids }
    return { id: `mst_${Date.now()}`, url: `https://${config.instance}/`, platform: 'mastodon', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: "MASTODON_ACCESS_TOKEN",
    label: "Mastodon",
    vendorDocUrl: "https://docs.joinmastodon.org/client/token/",
    steps: [
      "Open your Mastodon instance \u2192 Preferences \u2192 Development \u2192 New Application",
      "Scopes: write:statuses write:media read:accounts",
      "Copy the access token shown after creation",
    ],
  }),
});
