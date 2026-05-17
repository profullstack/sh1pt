import { defineSocial, tokenSetup, type SocialPost } from '@profullstack/sh1pt-core';

// Telegram Bot API. Bots auth with a bot token from @BotFather; channel /
// group posting requires the bot to be added as admin to the target chat.
// Personal accounts can also use Login Widget (OAuth-style) but that's
// for sign-in only, not posting.
interface Config {
  chatId: string;
  parseMode?: 'MarkdownV2' | 'HTML';
  disableNotification?: boolean;
}

export default defineSocial<Config>({
  id: 'social-telegram',
  label: 'Telegram',
  requires: { maxBodyChars: 4096, maxHashtags: 0, hashtagsInBody: true },

  async connect(ctx, config) {
    if (!ctx.secret('TELEGRAM_BOT_TOKEN')) throw new Error('TELEGRAM_BOT_TOKEN not in vault — run: sh1pt secret set TELEGRAM_BOT_TOKEN <bot-token>');
    return { accountId: config.chatId };
  },

  async post(ctx, post, config) {
    const token = ctx.secret('TELEGRAM_BOT_TOKEN');
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN not in vault — run: sh1pt secret set TELEGRAM_BOT_TOKEN <bot-token>');
    ctx.log(`telegram message · chat=${config.chatId} · ${post.body.length} chars`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://t.me/', platform: 'telegram', publishedAt: new Date().toISOString() };

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(formatTelegramMessage(post, config)),
    });
    const data = await parseTelegramResponse(res);
    if (!res.ok || !data.ok || !data.result) {
      throw new Error(data.description ?? res.statusText);
    }

    return {
      id: String(data.result.message_id),
      url: messageUrl(data.result, config),
      platform: 'telegram',
      publishedAt: new Date(data.result.date * 1000).toISOString(),
    };
  },

  setup: tokenSetup({
    secretKey: 'TELEGRAM_BOT_TOKEN',
    label: 'Telegram (bot)',
    vendorDocUrl: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
    steps: [
      'Open Telegram and start a chat with @BotFather',
      'Send /newbot, pick a display name and a username ending in "bot"',
      'Copy the bot token from the BotFather reply',
      'Add the bot as an admin to the channel/group you want to post to',
    ],
    fields: [
      { key: 'chatId', message: 'Default chat id (e.g. @yourchannel or numeric -100…):', required: true },
    ],
  }),
});

interface TelegramResponse {
  ok?: boolean;
  description?: string;
  result?: {
    message_id: number;
    date: number;
    chat?: {
      username?: string;
    };
  };
}

function formatTelegramMessage(post: SocialPost, config: Config): unknown {
  const link = post.link ? `\n${post.link}` : '';
  return {
    chat_id: config.chatId,
    text: `${post.body}${link}`.slice(0, 4096),
    parse_mode: config.parseMode,
    disable_notification: config.disableNotification,
  };
}

async function parseTelegramResponse(res: Response): Promise<TelegramResponse> {
  try {
    return await res.json() as TelegramResponse;
  } catch {
    return { ok: res.ok, description: res.statusText };
  }
}

function messageUrl(result: NonNullable<TelegramResponse['result']>, config: Config): string {
  const username = result.chat?.username ?? (config.chatId.startsWith('@') ? config.chatId.slice(1) : undefined);
  return username ? `https://t.me/${username}/${result.message_id}` : 'https://t.me/';
}
