import { defineBot } from '@sh1pt/core';

// Signal bot — signal-cli (Java CLI over JSON-RPC) or signal-cli-rest-api.
// No official bot platform; adapter shells out to signal-cli. SIGNAL_NUMBER
// is the registered E.164 number; auth handshake is one-shot per device.
interface Config { number: string; cliPath?: string }

export default defineBot<Config>({
  id: 'bot-signal',
  label: 'Signal',
  supports: ['message', 'command', 'reaction'],

  async register(ctx, handlers, config) {
    ctx.log(`bot-signal · register ${handlers.length} handlers (num=${config.number})`);
    if (ctx.dryRun) return { async close() {} };
    // TODO: spawn signal-cli daemon --json-rpc; parse envelope events.
    return { async close() {} };
  },

  async send(ctx, channel, reply) {
    ctx.log(`bot-signal · send → ${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: signal-cli send -m <text> <channel>
    return { id: `sg_${Date.now()}` };
  },
});
