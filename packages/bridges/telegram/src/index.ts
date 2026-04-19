import { defineBridge } from '@sh1pt/core';

// Telegram bridge — Bot API (getUpdates long-polling or webhook)
// receive, sendMessage send. "Channels" are chat_ids (channel = -100…,
// group = -…, DM = positive). Bot must be added to the group with read
// access (disable group privacy mode in BotFather if you want it to
// see all messages, not just commands).
interface Config {
  useWebhook?: boolean;             // if true, receive via webhook instead of long-poll
  webhookUrl?: string;
}

export default defineBridge<Config>({
  id: 'bridge-telegram',
  label: 'Telegram',

  async subscribe(ctx, channels, onMessage, config) {
    if (!ctx.secret('TELEGRAM_BOT_TOKEN')) throw new Error('TELEGRAM_BOT_TOKEN not in vault');
    ctx.log(`telegram bridge · chats=${channels.length} · mode=${config.useWebhook ? 'webhook' : 'long-poll'}`);
    // TODO:
    //   long-poll: loop GET /getUpdates?offset=<id>&timeout=30
    //   webhook:   setWebhook once → receive on config.webhookUrl
    // Filter updates to chat_ids in `channels`, map to BridgeMessage.
    return { async close() {} };
  },

  async send(ctx, channel, msg) {
    if (!ctx.secret('TELEGRAM_BOT_TOKEN')) throw new Error('TELEGRAM_BOT_TOKEN not in vault');
    ctx.log(`telegram bridge · sendMessage chat=${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: POST /sendMessage { chat_id, text: "<username> [<network>]: <text>", parse_mode }
    // For media use sendPhoto / sendVideo / sendDocument with file_id or URL.
    return { id: `tg_${Date.now()}` };
  },
});
