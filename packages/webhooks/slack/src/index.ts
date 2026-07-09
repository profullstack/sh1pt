import { defineWebhookTarget, webhookUrlSetup, type WebhookResult } from '@profullstack/sh1pt-core';

// Slack Incoming Webhook. Create at api.slack.com/apps → Incoming
// Webhooks → "Add New Webhook to Workspace" → pick a channel → copy URL.
// No OAuth scopes to manage once the URL exists.
interface Config {
  urlKey?: string;                     // default 'SLACK_WEBHOOK_URL'
  username?: string;
  iconEmoji?: string;                  // e.g. ':ship:'
  channelOverride?: string;            // e.g. '#alerts' — rarely needed
}

export default defineWebhookTarget<Config>({
  id: 'webhook-slack',
  label: 'Slack (incoming webhook)',

  format(payload, config) {
    return formatSlackPayload(payload, config);
  },

  async send(ctx, payload, config): Promise<WebhookResult> {
    const urlKey = config.urlKey ?? 'SLACK_WEBHOOK_URL';
    const url = ctx.secret(urlKey);
    if (!url) throw new Error(`${urlKey} not in vault — run: sh1pt secret set ${urlKey} <webhook-url>`);
    ctx.log(`slack webhook · ${payload.event}`);
    if (ctx.dryRun) return { ok: true, url };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(formatSlackPayload(payload, config)),
    });
    const text = await res.text().catch(() => res.statusText);
    if (!res.ok || text.trim() !== 'ok') {
      return { ok: false, status: res.status, error: text, url };
    }

    return { ok: true, status: res.status, url };
  },

  setup: webhookUrlSetup<Config>({
    secretKey: 'SLACK_WEBHOOK_URL',
    label: 'Slack (incoming webhook)',
    urlPrefix: 'https://hooks.slack.com/services/',
    vendorDocUrl: 'https://api.slack.com/messaging/webhooks',
    steps: [
      'Open api.slack.com/apps → your app (or create one) → Incoming Webhooks',
      'Toggle Activate Incoming Webhooks → Add New Webhook to Workspace',
      'Pick a channel → Allow → Copy Webhook URL',
    ],
  }),
});

function formatSlackPayload(
  payload: { event: string; timestamp: string; project?: string; data: Record<string, unknown> },
  config: Config,
): unknown {
  return {
    username: config.username ?? 'sh1pt',
    icon_emoji: config.iconEmoji ?? ':ship:',
    channel: config.channelOverride,
    text: `*${payload.event}*`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*${payload.event}* · _${payload.project ?? 'sh1pt'}_` } },
      { type: 'section', text: { type: 'mrkdwn', text: '```' + JSON.stringify(payload.data, null, 2).slice(0, 2800) + '```' } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: payload.timestamp }] },
    ],
  };
}
