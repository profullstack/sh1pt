import { defineBot } from '@sh1pt/core';

// phonenumbers.bot — phone-number-native bot platform. User brings a
// number (BYON), the service handles SMS + voice webhook routing and
// speaks back in the sh1pt BotEvent shape. Thin wrapper — the heavy
// lifting (STT, TTS, call-control state machine) is handled service-side.
//
// Auth: PHONENUMBERS_API_KEY. Endpoint: api.phonenumbers.bot/v1.
interface Config { numberId?: string; defaultVoice?: string }

export default defineBot<Config>({
  id: 'bot-phonenumbers',
  label: 'phonenumbers.bot',
  supports: ['message', 'command', 'call.start', 'call.end', 'call.utterance'],

  async register(ctx, handlers, config) {
    if (!ctx.secret('PHONENUMBERS_API_KEY')) throw new Error('PHONENUMBERS_API_KEY not in vault');
    ctx.log(`bot-phonenumbers · register ${handlers.length} handlers (num=${config.numberId ?? 'any'})`);
    if (ctx.dryRun) return { async close() {} };
    // TODO: POST /v1/subscriptions with a sh1pt-hosted webhook URL;
    // service translates SMS + voice events into BotEvent directly.
    return { async close() {} };
  },

  async send(ctx, channel, reply) {
    if (!ctx.secret('PHONENUMBERS_API_KEY')) throw new Error('PHONENUMBERS_API_KEY not in vault');
    ctx.log(`bot-phonenumbers · send → ${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: POST /v1/send with channel (E.164), text, optional voice payload.
    return { id: `pn_${Date.now()}` };
  },
});
