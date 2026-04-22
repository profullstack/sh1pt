import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// Forem — the open-source platform DEV Community runs on, used by many
// self-hosted communities (CodeNewbie, etc.). Same API shape as dev.to,
// different host. Point this adapter at any Forem instance.
interface Config {
  host: string;                 // e.g. 'community.codenewbie.org'
}

export default defineSocial<Config>({
  id: 'social-forem',
  label: 'Forem (self-hosted)',
  requires: { maxHashtags: 4, hashtagsInBody: false },
  async connect(ctx, config) {
    const key = `FOREM_API_KEY_${config.host.replace(/\W/g, '_').toUpperCase()}`;
    if (!ctx.secret(key)) throw new Error(`${key} not in vault`);
    return { accountId: config.host };
  },
  async post(ctx, post, config) {
    if (!post.title) throw new Error('Forem requires a title');
    ctx.log(`forem article · ${config.host} · "${post.title}"`);
    if (ctx.dryRun) return { id: 'dry-run', url: `https://${config.host}/`, platform: 'forem', publishedAt: new Date().toISOString() };
    // TODO: POST https://${host}/api/articles
    return { id: `forem_${Date.now()}`, url: `https://${config.host}/`, platform: 'forem', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: "FOREM_API_KEY",
    label: "Forem (self-hosted DEV)",
    vendorDocUrl: "https://dev.to/settings/extensions",
    steps: [
      "On your Forem instance \u2192 Settings \u2192 Extensions \u2192 API Keys \u2192 Generate",
      "Note: host URL needs to be in your sh1pt.config.ts (e.g. https://my.forem.com)",
    ],
  }),
});
