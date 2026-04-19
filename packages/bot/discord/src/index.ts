import { defineBot } from '@sh1pt/core';

// Discord bot — gateway WebSocket for events, REST for replies. Needs
// a bot token (DISCORD_BOT_TOKEN) + applicationId for slash command
// registration. Different from bridge-discord (which is relay-only).
interface Config { applicationId?: string; intents?: number }

export default defineBot<Config>({
  id: 'bot-discord',
  label: 'Discord',
  supports: ['message', 'command', 'interaction', 'reaction', 'join', 'leave'],

  async register(ctx, handlers, config) {
    if (!ctx.secret('DISCORD_BOT_TOKEN')) throw new Error('DISCORD_BOT_TOKEN not in vault');
    ctx.log(`bot-discord · register ${handlers.length} handlers (app=${config.applicationId ?? 'unset'})`);
    if (ctx.dryRun) return { async close() {} };
    // TODO: connect gateway, upsert slash commands, dispatch by match rules.
    return { async close() {} };
  },

  async send(ctx, channel, reply) {
    if (!ctx.secret('DISCORD_BOT_TOKEN')) throw new Error('DISCORD_BOT_TOKEN not in vault');
    ctx.log(`bot-discord · send → channel=${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: POST /channels/:id/messages with components rendered from reply.actions.
    return { id: `d_${Date.now()}` };
  },
});
