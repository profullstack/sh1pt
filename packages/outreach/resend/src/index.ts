import { tokenSetup } from '@profullstack/sh1pt-core';
// Resend — clean REST API for transactional + outbound email. Best-in-
// class dev UX. Use for cold outreach sequences (podcast pitches,
// investor intros if not using CapitalReach, beta-list announcements).
interface Config {
  from: string;                // "Name <you@domain.com>"
  replyTo?: string;
  subjectTemplate?: string;
  bodyTemplate?: string;       // supports {{name}}, {{company}}, etc.
  rateLimitPerHour?: number;   // default 20 — be polite
  domain?: string;             // sending domain (must be SPF/DKIM verified in Resend)
}

const API = 'https://api.resend.com';

export default {
  id: 'outreach-resend',
  label: 'Resend (cold email)',

  async connect(ctx: { secret(k: string): string | undefined; log(m: string): void }) {
    if (!ctx.secret('RESEND_API_KEY')) throw new Error('RESEND_API_KEY not in vault');
    return { accountId: 'resend' };
  },

  async sendSequence(
    ctx: { log(m: string): void; dryRun: boolean },
    recipients: { email: string; name?: string; data?: Record<string, string> }[],
    config: Config,
  ) {
    const rate = config.rateLimitPerHour ?? 20;
    ctx.log(`resend cold sequence · ${recipients.length} recipients · ${rate}/hr`);
    if (ctx.dryRun) return { sent: 0, queued: recipients.length };
    // TODO: POST ${API}/emails per recipient, rendered from bodyTemplate.
    // Queue with pacing so sends spread over time — 20/hr is the informal
    // "looks human" ceiling for cold outreach. Track bounces + unsubscribes
    // via webhooks and auto-suppress.
    //
    // ⚠ Follow CAN-SPAM / CASL / GDPR: legitimate-interest basis, physical
    // address in footer, one-click unsubscribe, honor opt-outs immediately.
    return { sent: 0, queued: recipients.length };
  },

  setup: tokenSetup({
    secretKey: "RESEND_API_KEY",
    label: "Resend (email)",
    vendorDocUrl: "https://resend.com/api-keys",
    steps: [
      "Open resend.com/api-keys \u2192 Create API Key (full access or send-only)",
      "Verify your sending domain (SPF + DKIM records)",
      "Respect CAN-SPAM / CASL / GDPR \u2014 include physical address + one-click unsubscribe",
    ],
  }),
};
