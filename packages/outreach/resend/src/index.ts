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

interface Recipient {
  email: string;
  name?: string;
  data?: Record<string, string>;
}

interface ResendSendResponse {
  id?: string;
  name?: string;
  message?: string;
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
    ctx: { secret(k: string): string | undefined; log(m: string): void; dryRun: boolean },
    recipients: Recipient[],
    config: Config,
  ) {
    if (!config.from) throw new Error('outreach-resend requires config.from');
    if (!config.subjectTemplate) throw new Error('outreach-resend requires config.subjectTemplate');
    if (!config.bodyTemplate) throw new Error('outreach-resend requires config.bodyTemplate');

    const rate = config.rateLimitPerHour ?? 20;
    if (rate <= 0) throw new Error('outreach-resend rateLimitPerHour must be greater than zero');
    if (recipients.length > rate) {
      throw new Error(`outreach-resend batch has ${recipients.length} recipients but rateLimitPerHour is ${rate}; split the sequence into smaller batches`);
    }

    ctx.log(`resend cold sequence · ${recipients.length} recipients · ${rate}/hr`);
    if (ctx.dryRun) return { sent: 0, queued: recipients.length };

    const token = ctx.secret('RESEND_API_KEY');
    if (!token) throw new Error('RESEND_API_KEY not in vault');

    const ids: string[] = [];
    for (const recipient of recipients) {
      const id = await sendEmail(token, recipient, config);
      ids.push(id);
    }

    return { sent: ids.length, queued: 0, ids };
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

async function sendEmail(token: string, recipient: Recipient, config: Config): Promise<string> {
  const res = await fetch(`${API}/emails`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: config.from,
      to: [recipient.email],
      subject: render(config.subjectTemplate ?? '', recipient),
      text: render(config.bodyTemplate ?? '', recipient),
      ...(config.replyTo ? { reply_to: config.replyTo } : {}),
    }),
  });

  const data = await readJson(res);
  if (!res.ok) {
    throw new Error(`Resend send failed for ${recipient.email}: ${data.message ?? data.name ?? res.statusText}`);
  }
  if (!data.id) throw new Error(`Resend response for ${recipient.email} did not include an email id`);
  return data.id;
}

function render(template: string, recipient: Recipient): string {
  const values: Record<string, string> = {
    email: recipient.email,
    name: recipient.name ?? '',
    ...(recipient.data ?? {}),
  };

  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => values[key] ?? '');
}

async function readJson(res: Response): Promise<ResendSendResponse> {
  try {
    return await res.json() as ResendSendResponse;
  } catch {
    return { message: res.statusText };
  }
}
