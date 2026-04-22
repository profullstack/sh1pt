import { defineBot } from '@profullstack/sh1pt-core';

// Telnyx — programmable SMS + Voice, similar surface to Twilio, often
// lower egress cost. API key auth (TELNYX_API_KEY). SMS via Messaging
// Profile + phone number; Voice via Call Control (webhook-driven state
// machine) with built-in STT via "transcription.started" events.
interface Config { messagingProfileId?: string; connectionId?: string; from: string; mode?: 'sms' | 'voice' | 'both' }

export default defineBot<Config>({
  id: 'bot-telnyx',
  label: 'Telnyx (SMS + Voice)',
  supports: ['message', 'command', 'call.start', 'call.end', 'call.utterance'],

  async register(ctx, handlers, config) {
    if (!ctx.secret('TELNYX_API_KEY')) throw new Error('TELNYX_API_KEY not in vault');
    ctx.log(`bot-telnyx · register ${handlers.length} handlers (mode=${config.mode ?? 'both'}, from=${config.from})`);
    if (ctx.dryRun) return { async close() {} };
    // TODO: receive webhooks at /telnyx/messaging and /telnyx/call-control;
    // verify telnyx-signature-ed25519; route call.transcription.finished
    // payloads to 'call.utterance' handlers.
    return { async close() {} };
  },

  async send(ctx, channel, reply) {
    if (!ctx.secret('TELNYX_API_KEY')) throw new Error('TELNYX_API_KEY not in vault');
    ctx.log(`bot-telnyx · send → ${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    if (reply.voice) {
      // TODO: POST /v2/calls + /actions/speak for TTS; or /actions/playback_start for audio.
      return { id: `txv_${Date.now()}` };
    }
    // TODO: POST /v2/messages { from, to, text, messaging_profile_id }.
    return { id: `txs_${Date.now()}` };
  },
});
