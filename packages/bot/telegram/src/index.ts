import { defineBot } from '@sh1pt/core';

// Telegram bot — long-polling getUpdates or webhook. Register via
// BotFather for token (TELEGRAM_BOT_TOKEN). Inline keyboards map to
// reply.actions; /commands are the natural command shape.
interface Config { mode?: 'polling' | 'webhook'; webhookUrl?: string }

export default defineBot<Config>({
  id: 'bot-telegram',
  label: 'Telegram',
  supports: ['message', 'command', 'interaction', 'join', 'leave'],

  async register(ctx, handlers, config) {
    if (!ctx.secret('TELEGRAM_BOT_TOKEN')) throw new Error('TELEGRAM_BOT_TOKEN not in vault');
    ctx.log(`bot-telegram · register ${handlers.length} handlers (mode=${config.mode ?? 'polling'})`);
    if (ctx.dryRun) return { async close() {} };
    // TODO: getUpdates loop or setWebhook; dispatch to handlers.
    return { async close() {} };
  },

  async send(ctx, channel, reply) {
    if (!ctx.secret('TELEGRAM_BOT_TOKEN')) throw new Error('TELEGRAM_BOT_TOKEN not in vault');
    ctx.log(`bot-telegram · send → chat=${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: POST /bot<token>/sendMessage { chat_id, text, reply_markup }.
    return { id: `t_${Date.now()}` };
  },
});
