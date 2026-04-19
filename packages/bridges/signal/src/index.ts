import { defineBridge } from '@sh1pt/core';

// Signal bridge — piggy-backs on signal-cli / signald running as a
// daemon. Receive via `signal-cli daemon` JSON-RPC; send via the same.
// Same caveats as target-chat-signal: number gets flagged if you scale
// volume, register via captcha flow, don't use a personal number.
interface Config {
  phoneNumber: string;              // +E.164 registered Signal number
  runtime: 'signal-cli' | 'signald';
  rpcEndpoint?: string;             // default 'ws://localhost:8080/rpc' for signal-cli daemon
}

export default defineBridge<Config>({
  id: 'bridge-signal',
  label: 'Signal',

  async subscribe(ctx, channels, onMessage, config) {
    ctx.log(`signal bridge · ${config.runtime} · number=${config.phoneNumber}`);
    // TODO: connect to signal-cli daemon RPC endpoint, subscribe to
    // "receive" events, map to BridgeMessage. "channels" for Signal is
    // group ids (base64-encoded); DMs are impossible to bridge cleanly.
    return { async close() {} };
  },

  async send(ctx, channel, msg, config) {
    ctx.log(`signal bridge · sendGroup group=${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: JSON-RPC call `sendGroup` or `send` with message + attachments
    return { id: `sig_${Date.now()}` };
  },
});
