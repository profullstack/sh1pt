import nodemailer, { type Transporter } from 'nodemailer';

// Reuse a single SMTP transporter across warm requests. Nodemailer
// pools connections internally when pool:true so this is cheap even
// under moderate signup volume.
let cached: Transporter | null = null;

export function getMailer(): Transporter | null {
  if (cached) return cached;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('[email] SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASSWORD) — emails will be skipped');
    return null;
  }

  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,               // implicit TLS on 465, STARTTLS otherwise
    auth: { user, pass },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });

  return cached;
}

export const MAIL_FROM = process.env.SMTP_FROM ?? 'sh1pt <noreply@sh1pt.com>';
