import { defineWebhookTarget, type WebhookResult } from '@profullstack/sh1pt-core';

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
  },

  async send(ctx, payload, config): Promise<WebhookResult> {
    const urlKey = config.urlKey ?? 'SLACK_WEBHOOK_URL';
    const url = ctx.secret(urlKey);
    if (!url) throw new Error(`${urlKey} not in vault`);
    ctx.log(`slack webhook · ${payload.event}`);
    if (ctx.dryRun) return { ok: true, url };
    // TODO: POST url with the formatted block payload; 200 "ok" on success
    return { ok: true, url };
  },
});
