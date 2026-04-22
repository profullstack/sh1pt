import { defineWebhookTarget, type WebhookResult } from '@profullstack/sh1pt-core';

// Telegram — not strictly "just a webhook URL," but close. Pipe through
// a bot with sendMessage; setup is trivial (BotFather → /newbot → token +
// add bot to channel → grab chat_id). For the full bot experience use
// target-chat-telegram instead.
interface Config {
  chatId: string | number;             // -100XXXX for channels/groups, positive for DMs
  parseMode?: 'MarkdownV2' | 'HTML';
  disableNotification?: boolean;       // silent push
}

export default defineWebhookTarget<Config>({
  id: 'webhook-telegram',
  label: 'Telegram (bot sendMessage)',

  format(payload, config) {
    const summary = `*${escape(payload.event)}*`;
    const body = '```\n' + JSON.stringify(payload.data, null, 2).slice(0, 3500) + '\n```';
    return {
      chat_id: config.chatId,
      text: `${summary}\n${body}`,
      parse_mode: config.parseMode ?? 'MarkdownV2',
      disable_notification: config.disableNotification,
    };
  },

  async send(ctx, payload, config): Promise<WebhookResult> {
    const token = ctx.secret('TELEGRAM_BOT_TOKEN');
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN not in vault (BotFather → /newbot → copy the token)');
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    ctx.log(`telegram webhook · chat=${config.chatId}`);
    if (ctx.dryRun) return { ok: true, url };
    // TODO: POST url with formatted body
    return { ok: true, url };
  },
});

function escape(s: string): string {
  return s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => '\\' + c);
}
