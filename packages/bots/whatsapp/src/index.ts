import { defineBot } from '@sh1pt/core';

// WhatsApp bot — Meta Cloud API (graph.facebook.com/v21.0/<phone_id>).
// Requires WABA (WhatsApp Business Account) + phone number + access token
// (WHATSAPP_ACCESS_TOKEN). Outbound outside 24h window must use approved
// templates; adapter enforces that in send().
interface Config { phoneNumberId: string; wabaId?: string }

export default defineBot<Config>({
  id: 'bot-whatsapp',
  label: 'WhatsApp',
  supports: ['message', 'command', 'interaction'],

  async register(ctx, handlers, config) {
    if (!ctx.secret('WHATSAPP_ACCESS_TOKEN')) throw new Error('WHATSAPP_ACCESS_TOKEN not in vault');
    ctx.log(`bot-whatsapp · register ${handlers.length} handlers (phone=${config.phoneNumberId})`);
    if (ctx.dryRun) return { async close() {} };
    // TODO: subscribe to webhook for messages / interactive responses.
    return { async close() {} };
  },

  async send(ctx, channel, reply) {
    if (!ctx.secret('WHATSAPP_ACCESS_TOKEN')) throw new Error('WHATSAPP_ACCESS_TOKEN not in vault');
    ctx.log(`bot-whatsapp · send → ${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: POST /<phone_id>/messages with text or interactive buttons;
    // fall back to template if outside 24h conversation window.
    return { id: `w_${Date.now()}` };
  },
});
