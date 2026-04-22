import { defineWebhookTarget, type WebhookResult } from '@profullstack/sh1pt-core';

// Microsoft Teams — Incoming Webhook connector. Channel → ... →
// Connectors → Incoming Webhook → name + copy URL. Posts render as
// MessageCards or the newer Adaptive Cards format.
interface Config {
  urlKey?: string;                     // default 'TEAMS_WEBHOOK_URL'
  useAdaptiveCards?: boolean;          // v1.5 Adaptive Cards (recommended) vs legacy MessageCard
}

export default defineWebhookTarget<Config>({
  id: 'webhook-teams',
  label: 'Microsoft Teams (incoming webhook)',

  format(payload, config) {
    if (config.useAdaptiveCards !== false) {
      return {
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            type: 'AdaptiveCard',
            version: '1.5',
            body: [
              { type: 'TextBlock', text: payload.event, weight: 'Bolder', size: 'Large' },
              { type: 'TextBlock', text: '```\n' + JSON.stringify(payload.data, null, 2).slice(0, 3500) + '\n```', wrap: true },
              { type: 'TextBlock', text: payload.timestamp, isSubtle: true, spacing: 'None' },
            ],
          },
        }],
      };
    }
    return {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: payload.event,
      title: payload.event,
      text: '```' + JSON.stringify(payload.data, null, 2).slice(0, 3500) + '```',
    };
  },

  async send(ctx, payload, config): Promise<WebhookResult> {
    const urlKey = config.urlKey ?? 'TEAMS_WEBHOOK_URL';
    const url = ctx.secret(urlKey);
    if (!url) throw new Error(`${urlKey} not in vault`);
    ctx.log(`teams webhook · ${payload.event}`);
    if (ctx.dryRun) return { ok: true, url };
    return { ok: true, url };
  },
});
