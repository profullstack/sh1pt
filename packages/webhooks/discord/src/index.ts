import { defineWebhookTarget, type WebhookResult } from '@profullstack/sh1pt-core';

// Discord channel webhook. Simplest possible integration — Channel
// Settings → Integrations → Webhooks → Create → copy URL → paste in.
// No bot, no OAuth app, no review. Often all a project actually needs.
interface Config {
  // Webhook URL from Discord. Users paste this during setup; sh1pt stores
  // it in the vault under DISCORD_WEBHOOK_URL (or per-channel keys like
  // DISCORD_WEBHOOK_URL_RELEASES / DISCORD_WEBHOOK_URL_ALERTS).
  urlKey?: string;                     // secret key name; default 'DISCORD_WEBHOOK_URL'
  username?: string;                   // override the webhook's display name
  avatarUrl?: string;
  mention?: string;                    // e.g. '<@&ROLE_ID>' to ping a role
}

export default defineWebhookTarget<Config>({
  id: 'webhook-discord',
  label: 'Discord (channel webhook)',

  format(payload, config) {
    // Discord accepts { content, embeds, username, avatar_url }.
    const prefix = config.mention ? `${config.mention} ` : '';
    const summary = summarize(payload);
    return {
      username: config.username ?? 'sh1pt',
      avatar_url: config.avatarUrl,
      content: `${prefix}${summary}`,
      embeds: [{
        title: payload.event,
        description: '```json\n' + JSON.stringify(payload.data, null, 2).slice(0, 1800) + '\n```',
        timestamp: payload.timestamp,
        color: colorFor(payload.event),
      }],
    };
  },

  async send(ctx, payload, config): Promise<WebhookResult> {
    const urlKey = config.urlKey ?? 'DISCORD_WEBHOOK_URL';
    const url = ctx.secret(urlKey);
    if (!url) throw new Error(`${urlKey} not in vault — paste the Discord webhook URL via \`sh1pt secret set ${urlKey}\``);
    ctx.log(`discord webhook · event=${payload.event}`);
    if (ctx.dryRun) return { ok: true, url };
    // TODO: POST url with Content-Type application/json; body = this.format(payload, config).
    // Discord returns 204 on success, 429 with retry_after on rate limit.
    return { ok: true, url };
  },
});

function summarize(p: { event: string; data: Record<string, unknown> }): string {
  if (p.event.startsWith('ship.')) return `🚀 ship ${p.event.replace('ship.', '')}: ${p.data.target ?? ''}`;
  if (p.event.startsWith('payments.')) return `💸 ${p.event}: ${p.data.amount ?? ''} ${p.data.currency ?? ''}`;
  if (p.event.startsWith('scale.alarm.')) return `⚠ alarm: ${p.data.message ?? p.event}`;
  return p.event;
}

function colorFor(event: string): number {
  if (event.endsWith('.failed') || event.endsWith('.rejected') || event.endsWith('.tripped')) return 0xef4444; // red
  if (event.endsWith('.published') || event.endsWith('.completed') || event.endsWith('.succeeded')) return 0x22c55e; // green
  return 0x38bdf8; // sh1pt accent
}
