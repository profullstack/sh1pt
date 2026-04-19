import { defineBridge } from '@sh1pt/core';

// Matrix bridge — the original bridge-first protocol. Use the regular
// client/server API (sync + m.room.message) for simple bridges;
// appservice API when you need "virtual users" so each bridged identity
// gets its own MXID ghost. Matrix is the best network to bridge INTO
// since its data model maps cleanly to every other network.
interface Config {
  homeserver: string;               // e.g. 'https://matrix.org' or self-hosted
  userId: string;                   // '@bridgebot:example.org'
  appservice?: {                    // optional: run as an appservice for ghost users
    id: string;                     // as_token receives this
    namespacePrefix: string;        // e.g. '@sh1pt_'
  };
}

export default defineBridge<Config>({
  id: 'bridge-matrix',
  label: 'Matrix',

  async subscribe(ctx, channels, onMessage, config) {
    const key = config.appservice ? 'MATRIX_AS_TOKEN' : 'MATRIX_ACCESS_TOKEN';
    if (!ctx.secret(key)) throw new Error(`${key} not in vault`);
    ctx.log(`matrix bridge · ${config.homeserver} · rooms=${channels.length}`);
    // TODO: /sync long-polling (or /sync?since=... incremental); filter
    // m.room.message events to the subscribed room_ids. For appservice
    // mode, handle /transactions/<txnId> webhooks from the homeserver.
    return { async close() {} };
  },

  async send(ctx, channel, msg, config) {
    ctx.log(`matrix bridge · m.room.message → ${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: PUT /_matrix/client/v3/rooms/<room_id>/send/m.room.message/<txnId>
    // with { msgtype: 'm.text' | 'm.image' | 'm.file', body, formatted_body }
    // If appservice: impersonate via ?user_id=<ghost> from the namespace.
    return { id: `mx_${Date.now()}` };
  },
});
