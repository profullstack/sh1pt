// Resend REST transport. Simpler than SMTP for our use case — one
// fetch per email, no connection pool, clearer error surfaces.
//
// Reads RESEND_API_KEY (preferred) or falls back to SMTP_PASSWORD so
// the existing Railway env vars keep working without a rename.

export interface SendArgs {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

function resolveKey(): string | null {
  return (
    process.env.RESEND_API_KEY ??
    process.env.SMTP_PASSWORD ??
    process.env.SMTP_PASS ??
    null
  );
}

export const MAIL_FROM =
  process.env.RESEND_FROM ??
  process.env.SMTP_FROM ??
  'sh1pt. <hello@sh1pt.com>';

export async function sendMail(args: SendArgs): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const key = resolveKey();
  if (!key) {
    console.warn('[email] no RESEND_API_KEY / SMTP_PASSWORD set — skipping send');
    return { ok: false, reason: 'no-api-key' };
  }

  const body = {
    from: MAIL_FROM,
    to: Array.isArray(args.to) ? args.to : [args.to],
    subject: args.subject,
    html: args.html,
    text: args.text,
    headers: args.headers,
  };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[email] resend API error', res.status, payload);
      return { ok: false, reason: `http-${res.status}` };
    }
    return { ok: true, id: String(payload.id ?? 'unknown') };
  } catch (err) {
    console.error('[email] resend fetch failed', err);
    return { ok: false, reason: 'fetch-failed' };
  }
}
