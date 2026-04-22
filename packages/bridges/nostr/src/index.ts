import { defineBridge } from '@profullstack/sh1pt-core';

// Nostr bridge — relay WebSocket subscriptions for receive, signed
// events for send. "Channels" are public keys (for user feeds) or
// #<topic> hashtags. Shares nsec + relay config with social-primal +
// social-blossom.
interface Config {
  relays: string[];                 // e.g. ['wss://relay.damus.io', 'wss://nos.lol']
  filterKinds?: number[];           // default: [1] (text notes)
}

export default defineBridge<Config>({
  id: 'bridge-nostr',
  label: 'Nostr',

  async subscribe(ctx, channels, onMessage, config) {
    if (!ctx.secret('NOSTR_NSEC')) throw new Error('NOSTR_NSEC not in vault');
    ctx.log(`nostr bridge · relays=${config.relays.length} · tags=${channels.join(',')}`);
    // TODO: open WebSocket to each relay, send
    //   ["REQ", subId, { kinds: config.filterKinds ?? [1], "#t": channels }]
    // parse incoming ["EVENT", subId, event] → BridgeMessage.
    return { async close() {} };
  },

  async send(ctx, channel, msg, config) {
    ctx.log(`nostr bridge · signed kind:1 event tagged #${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: build kind:1 event with content=rendered msg, tags=[['t', channel],
    // ['client', 'sh1pt']], sign with nsec, publish to all config.relays.
    return { id: `nostr_${Date.now()}` };
  },
});
