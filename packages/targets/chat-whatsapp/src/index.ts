import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

// WhatsApp Business Cloud API (Meta). The most regulated of any chat
// surface: outside the 24-hour customer-initiated window, only
// pre-approved Message Templates may be sent. Phone number must be
// verified and business account must pass Meta Business Verification.
interface Config {
  phoneNumberId: string;                 // Meta-assigned, not the +NNN number
  wabaId: string;                        // WhatsApp Business Account id
  webhookUrl: string;
  // Templates to register with WhatsApp for outbound messages. Each
  // template goes through a separate Meta review (~24h, can reject).
  templates?: {
    name: string;
    language: string;                    // e.g. 'en_US'
    category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
    body: string;                        // with {{1}}, {{2}} placeholders
  }[];
}

export default defineTarget<Config>({
  id: 'chat-whatsapp',
  kind: 'chat',
  label: 'WhatsApp Business Cloud API',
  async build(ctx, config) {
    ctx.log(`render WhatsApp template manifest · ${config.templates?.length ?? 0} templates`);
    // TODO: validate template placeholders match body content
    return { artifact: `${ctx.outDir}/whatsapp-templates.json` };
  },
  async ship(ctx, config) {
    ctx.log(`whatsapp · register webhook + submit templates for review`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO:
    //  - Graph API POST /{phone_number_id}/webhooks with WHATSAPP_SYSTEM_USER_TOKEN
    //  - POST /{waba_id}/message_templates for each template (enters review queue)
    return {
      id: `${config.phoneNumberId}@${ctx.version}`,
      url: `https://business.facebook.com/wa/manage/phone-numbers/?waba_id=${config.wabaId}`,
    };
  },
  async status(id) {
    return { state: 'in-review', version: id, message: 'template approvals can take up to 24h; 24h session window applies for free-form outbound' };
  },

  setup: manualSetup({
    label: "WhatsApp Business Cloud API",
    vendorDocUrl: "https://developers.facebook.com/docs/whatsapp",
    steps: [
      "Register a Meta Business account + request Cloud API access",
      "Complete business verification (2-7 days, requires business docs)",
      "Run: sh1pt secret set WHATSAPP_BUSINESS_TOKEN <token>",
    ],
  }),
});
