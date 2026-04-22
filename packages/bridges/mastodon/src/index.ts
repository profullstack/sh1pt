import { defineBridge } from '@profullstack/sh1pt-core';

// Mastodon bridge — streaming API for receive (/api/v1/streaming/user),
// /api/v1/statuses for send. "Channels" on Mastodon are hashtag streams
// (public) or specific user DMs. Pair one instance at a time.
interface Config {
  instance: string;                 // e.g. 'mastodon.social'
}

export default defineBridge<Config>({
  id: 'bridge-mastodon',
  label: 'Mastodon',

  async subscribe(ctx, channels, onMessage, config) {
    const key = `MASTODON_TOKEN_${config.instance.replace(/\./g, '_').toUpperCase()}`;
    if (!ctx.secret(key)) throw new Error(`${key} not in vault`);
    ctx.log(`mastodon bridge · ${config.instance} · hashtags=${channels.join(',')}`);
    // TODO: GET https://${instance}/api/v1/streaming/hashtag?tag=<tag> with Authorization Bearer.
    // Server-sent events; parse JSON, map to BridgeMessage.
    return { async close() {} };
  },

  async send(ctx, channel, msg, config) {
    ctx.log(`mastodon bridge · POST /statuses`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: POST /api/v1/statuses with { status, visibility, media_ids }
    // Tag the post with #<channel> so it lands in the hashtag stream.
    return { id: `mst_${Date.now()}` };
  },
});
