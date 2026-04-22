import { defineTarget } from '@profullstack/sh1pt-core';

// Telegram bots. No "store" — a bot is just a token + webhook URL. This
// adapter registers the webhook with Telegram, sets commands/description/
// about text, and optionally submits to bot directories (t.me/BotFather,
// storebot.me, combot.org). Hosting the bot itself is orthogonal — pair
// with deploy-workers / deploy-fly.
interface Config {
  botUsername: string;               // e.g. 'my_sh1pt_bot' (no @)
  webhookUrl: string;                // where Telegram will POST updates
  commands?: { command: string; description: string }[];
  description?: string;
  shortDescription?: string;
  directoryListings?: ('storebot.me' | 'combot.org')[];
}

export default defineTarget<Config>({
  id: 'chat-telegram',
  kind: 'chat',
  label: 'Telegram Bot',
  async build(ctx) {
    ctx.log(`no-op build — bot code is hosted separately (pair with deploy-workers/fly/etc.)`);
    return { artifact: ctx.projectDir };
  },
  async ship(ctx, config) {
    ctx.log(`telegram · setWebhook + setMyCommands for @${config.botUsername}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: Bot API calls using TELEGRAM_BOT_TOKEN
    //  - setWebhook(url=config.webhookUrl, secret_token=random)
    //  - setMyCommands(commands=config.commands)
    //  - setMyDescription / setMyShortDescription
    return { id: `@${config.botUsername}@${ctx.version}`, url: `https://t.me/${config.botUsername}` };
  },
  async status(id) {
    return { state: 'live', version: id };
  },
});
