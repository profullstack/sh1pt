import { defineBot, tokenSetup } from '@profullstack/sh1pt-core';

// Twilio — SMS (Programmable Messaging) + Voice (Programmable Voice) from
// the same account. Channel strings are E.164 phone numbers for both.
// SMS: inbound via webhook → 'message'; outbound via /Messages.json.
// Voice: inbound call webhook → 'call.start' / 'call.utterance' events
// (after <Gather>/STT step); outbound via /Calls.json with TwiML <Say>.
interface Config { accountSid: string; from: string; mode?: 'sms' | 'voice' | 'both' }

export default defineBot<Config>({
  id: 'bot-twilio',
  label: 'Twilio (SMS + Voice)',
  supports: ['message', 'command', 'call.start', 'call.end', 'call.utterance'],

  async register(ctx, handlers, config) {
    if (!ctx.secret('TWILIO_AUTH_TOKEN')) throw new Error('TWILIO_AUTH_TOKEN not in vault');
    ctx.log(`bot-twilio · register ${handlers.length} handlers (mode=${config.mode ?? 'both'}, from=${config.from})`);
    if (ctx.dryRun) return { async close() {} };
    // TODO: host /sms and /voice webhook endpoints; validate X-Twilio-Signature;
    // for voice, emit TwiML <Gather input="speech"> and dispatch transcripts
    // as 'call.utterance' events.
    return { async close() {} };
  },

  async send(ctx, channel, reply, config) {
    if (!ctx.secret('TWILIO_AUTH_TOKEN')) throw new Error('TWILIO_AUTH_TOKEN not in vault');
    ctx.log(`bot-twilio · send → ${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    if (reply.voice) {
      // TODO: POST /2010-04-01/Accounts/{sid}/Calls.json with TwiML <Say>/<Play>.
      return { id: `tv_${Date.now()}` };
    }
    // TODO: POST /2010-04-01/Accounts/{sid}/Messages.json { From, To, Body }.
    return { id: `ts_${Date.now()}` };
  },

  setup: tokenSetup({
    secretKey: 'TWILIO_AUTH_TOKEN',
    label: 'Twilio SMS/voice',
    vendorDocUrl: 'https://console.twilio.com/',
    steps: [
      'Open https://console.twilio.com/',
      'Create a bot application / API key',
      'Copy the token shown (usually once)',
    ],
  }),
});
