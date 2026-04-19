import { defineBot } from '@sh1pt/core';

// IRC bot — classic RFC 2812. Minimal interactivity (no rich components),
// commands are !trigger or PRIVMSG parsing. SASL auth via IRC_PASSWORD.
interface Config { server: string; port?: number; nick: string; channels: string[] }

export default defineBot<Config>({
  id: 'bot-irc',
  label: 'IRC',
  supports: ['message', 'command', 'join', 'leave'],

  async register(ctx, handlers, config) {
    ctx.log(`bot-irc · register ${handlers.length} handlers (${config.nick}@${config.server})`);
    if (ctx.dryRun) return { async close() {} };
    // TODO: TCP/TLS connect, NICK/USER, JOIN channels, parse PRIVMSG.
    return { async close() {} };
  },

  async send(ctx, channel, reply) {
    ctx.log(`bot-irc · send → ${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: PRIVMSG <channel> :<text>
    return { id: `i_${Date.now()}` };
  },
});
