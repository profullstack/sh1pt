import { createHmac } from 'node:crypto';
import { defineWebhookTarget, webhookUrlSetup, type WebhookResult } from '@profullstack/sh1pt-core';

// Generic HTTP POST target. Use when the destination doesn't have its
// own adapter — Zapier webhook, n8n webhook, your own server, etc.
// sh1pt HMAC-signs the raw body with the configured secret so the
// receiver can verify the call originated here.
interface Config {
  urlKey?: string;                     // secret key holding the URL; default 'WEBHOOK_URL'
  secretKey?: string;                  // secret key holding the HMAC signing secret; default 'WEBHOOK_SECRET'
  method?: 'POST' | 'PUT';
  extraHeaders?: Record<string, string>;
}

export default defineWebhookTarget<Config>({
  id: 'webhook-generic',
  label: 'Generic HTTP webhook',

  async send(ctx, payload, config): Promise<WebhookResult> {
    const urlKey = config.urlKey ?? 'WEBHOOK_URL';
    const url = ctx.secret(urlKey);
    if (!url) throw new Error(`${urlKey} not in vault — paste the destination URL via \`sh1pt secret set ${urlKey}\``);

    const body = JSON.stringify(payload);
    ctx.log(`generic webhook · ${config.method ?? 'POST'} ${url}`);
    if (ctx.dryRun) return { ok: true, url };

    const signingSecret = ctx.secret(config.secretKey ?? 'WEBHOOK_SECRET');
    const signature = signingSecret ? hmacSha256(body, signingSecret) : undefined;
    const res = await fetch(url, {
      method: config.method ?? 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Sh1pt-Event': payload.event,
        ...(signature ? { 'X-Sh1pt-Signature': signature } : {}),
        ...config.extraHeaders,
      },
      body,
    });

    if (!res.ok) {
      const error = await res.text().catch(() => res.statusText);
      return { ok: false, status: res.status, error, url };
    }

    return { ok: true, status: res.status, url };
  },

  setup: webhookUrlSetup<Config>({
    secretKey: 'WEBHOOK_URL',
    label: 'Generic HTTP webhook',
    urlPrefix: 'https://',
    steps: [
      'Pick the destination URL that should receive sh1pt events (Zapier, n8n, your own server, …)',
      'Paste it when prompted',
      'sh1pt HMAC-signs the body; set WEBHOOK_SECRET with `sh1pt secret set WEBHOOK_SECRET <secret>` so the receiver can verify',
    ],
  }),
});

function hmacSha256(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}
