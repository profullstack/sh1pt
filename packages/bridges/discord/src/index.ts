import { defineBridge, type BridgeMessage, tokenSetup } from '@profullstack/sh1pt-core';

// Discord bridge — gateway WebSocket for receive, bot API for send.
// Uses a bot user (not a webhook) since only bots can subscribe to live
// message events. Needs MESSAGE CONTENT intent enabled in the app
// settings or reads only content the bot is mentioned in.
interface Config {
  intents?: number;                 // Discord gateway intents bitfield
  applicationId?: string;
}

export default defineBridge<Config>({
  id: 'bridge-discord',
  label: 'Discord',

  async subscribe(ctx, channels, onMessage) {
    if (!ctx.secret('DISCORD_BOT_TOKEN')) throw new Error('DISCORD_BOT_TOKEN not in vault');
    ctx.log(`discord bridge · subscribing to ${channels.length} channels`);
    // TODO: open gateway WebSocket, identify with intents, filter MESSAGE_CREATE
    // events to subscribed channels, map to BridgeMessage, call onMessage.
    return { async close() { /* disconnect gateway */ } };
  },

  async send(ctx, channel, msg): Promise<{ id: string }> {
    if (!ctx.secret('DISCORD_BOT_TOKEN')) throw new Error('DISCORD_BOT_TOKEN not in vault');
    ctx.log(`discord bridge send → channel=${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: POST /channels/:id/messages { content, embeds, files }. Use
    // an embed with author = incoming identity so the relayed message
    // shows "<username> [<network>]" as the author.
    return { id: `d_${Date.now()}` };
  },

  setup: tokenSetup({
    secretKey: 'DISCORD_BRIDGE_BOT_TOKEN',
    label: 'Discord bridge',
    vendorDocUrl: 'https://discord.com/developers/applications',
    steps: [
      'Open https://discord.com/developers/applications',
      'Create a bot application / API key',
      'Copy the token shown (usually once)',
    ],
  }),
});
