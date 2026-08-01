import { defineBot, manualSetup } from '@profullstack/sh1pt-core';
import { z } from 'zod';

const configSchema = z.object({
  numberId: z.string().optional(),
  defaultVoice: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

export default defineBot<Partial<Config>>({
  id: 'bot-phonenumbers',
  label: 'phonenumbers.bot',
  supports: ['message', 'command', 'call.start', 'call.end', 'call.utterance'],

  async register(ctx, handlers, config) {
    const parsed = configSchema.parse(config);
    if (!ctx.secret('PHONENUMBERS_API_KEY')) throw new Error('PHONENUMBERS_API_KEY not in vault');
    ctx.log(`bot-phonenumbers · register ${handlers.length} handlers (num=${parsed.numberId ?? 'any'})`);
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

  setup: manualSetup({
    label: "Phone-number bot (meta)",
    steps: [
      "Abstract base \u2014 configure via Twilio or Telnyx instead",
    ],
  }),
});
