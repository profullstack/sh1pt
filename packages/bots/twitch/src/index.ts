import { defineBot } from '@sh1pt/core';

// Twitch bot — IRC-compatible chat (tmi.twitch.tv) + EventSub for
// non-chat events (follows, subs, redemptions). OAuth token via
// TWITCH_OAUTH_TOKEN (chat:read chat:edit for chat; more for EventSub).
interface Config { channel: string; clientId?: string }

export default defineBot<Config>({
  id: 'bot-twitch',
  label: 'Twitch',
  supports: ['message', 'command', 'join', 'leave'],

  async register(ctx, handlers, config) {
    if (!ctx.secret('TWITCH_OAUTH_TOKEN')) throw new Error('TWITCH_OAUTH_TOKEN not in vault');
    ctx.log(`bot-twitch · register ${handlers.length} handlers (#${config.channel})`);
    if (ctx.dryRun) return { async close() {} };
    // TODO: connect to irc.chat.twitch.tv:6697 wss, JOIN, parse PRIVMSG.
    return { async close() {} };
  },

  async send(ctx, channel, reply) {
    if (!ctx.secret('TWITCH_OAUTH_TOKEN')) throw new Error('TWITCH_OAUTH_TOKEN not in vault');
    ctx.log(`bot-twitch · send → #${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: PRIVMSG #<channel> :<text>. Helix sendChatMessage is an
    // alternative with richer metadata.
    return { id: `tw_${Date.now()}` };
  },
});
