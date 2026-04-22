import { defineBot } from '@profullstack/sh1pt-core';

// Slack app — Socket Mode (preferred) or Events API webhook. Needs
// SLACK_BOT_TOKEN (xoxb-) and SLACK_APP_TOKEN (xapp-) for Socket Mode.
// Block Kit renders reply.actions as action blocks.
interface Config { mode?: 'socket' | 'events' }

export default defineBot<Config>({
  id: 'bot-slack',
  label: 'Slack',
  supports: ['message', 'command', 'interaction', 'reaction', 'join', 'leave'],

  async register(ctx, handlers, config) {
    if (!ctx.secret('SLACK_BOT_TOKEN')) throw new Error('SLACK_BOT_TOKEN not in vault');
    ctx.log(`bot-slack · register ${handlers.length} handlers (mode=${config.mode ?? 'socket'})`);
    if (ctx.dryRun) return { async close() {} };
    // TODO: open Socket Mode WS or subscribe to Events API; dispatch.
    return { async close() {} };
  },

  async send(ctx, channel, reply) {
    if (!ctx.secret('SLACK_BOT_TOKEN')) throw new Error('SLACK_BOT_TOKEN not in vault');
    ctx.log(`bot-slack · send → channel=${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: chat.postMessage with blocks built from reply.actions.
    return { id: `s_${Date.now()}` };
  },
});
