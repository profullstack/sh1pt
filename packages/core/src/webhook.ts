// Webhook — the minimum viable integration. Two shapes:
//
// 1. **Outbound to a webhook URL** — sh1pt POSTs to someone else's URL
//    when something happens. Discord channels, Slack channels, Teams
//    channels, Telegram bots, generic HTTP sinks. Often all you need.
//
// 2. **Subscriptions from sh1pt** — customers paste a URL into sh1pt
//    and sh1pt POSTs to it on configured events (ship.published,
//    payment.succeeded, scale.alarm.tripped, etc.). Same machinery,
//    different direction.

export type SupportedEvent =
  // ship lifecycle
  | 'ship.started' | 'ship.published' | 'ship.failed' | 'ship.rolled_back' | 'ship.rejected'
  // promote
  | 'promote.campaign.started' | 'promote.campaign.ended'
  | 'promote.social.posted'
  | 'promote.merch.order.placed' | 'promote.merch.order.shipped'
  | 'promote.investors.reply_received' | 'promote.investors.meeting_booked'
  // scale
  | 'scale.rollout.started' | 'scale.rollout.completed'
  | 'scale.alarm.tripped'  | 'scale.instance.provisioned' | 'scale.instance.destroyed'
  // iterate
  | 'iterate.cycle.completed' | 'iterate.experiment.concluded'
  // payments
  | 'payments.checkout.completed' | 'payments.refunded' | 'payments.disputed'
  // generic
  | 'any';

export interface WebhookPayload {
  event: SupportedEvent | string;
  timestamp: string;                   // ISO
  project?: string;
  data: Record<string, unknown>;       // event-specific body
  // Included on outbound subscriptions so receivers can verify HMAC.
  // sh1pt signs the raw body with an HMAC-SHA256 using the subscription's
  // signing secret, placed in the `X-Sh1pt-Signature` header.
}

export interface WebhookResult {
  ok: boolean;
  status?: number;                     // HTTP response status
  error?: string;
  url?: string;                        // where this ended up (e.g. the posted message URL, if available)
}

// ------ Outbound-to-URL integration ----------------------------------

export interface WebhookTarget<Config = unknown> {
  id: string;                          // e.g. 'webhook-discord'
  label: string;
  // Post a message through the configured webhook URL. For chat-style
  // integrations (Discord, Slack, Telegram, Teams) this becomes a
  // channel message. For the generic adapter it's a raw JSON POST.
  send(
    ctx: { secret(k: string): string | undefined; log(m: string): void; dryRun: boolean },
    payload: WebhookPayload,
    config: Config,
  ): Promise<WebhookResult>;
  // Optional: adapt the payload into a platform-native shape. Default
  // just posts { event, data } — override when a platform expects
  // specific fields (e.g. Slack's blocks, Discord's embeds).
  format?(payload: WebhookPayload, config: Config): unknown;
}

export function defineWebhookTarget<Config>(t: WebhookTarget<Config>): WebhookTarget<Config> {
  return t;
}

const webhookRegistry = new Map<string, WebhookTarget<any>>();

export function registerWebhookTarget(t: WebhookTarget<any>): void {
  if (webhookRegistry.has(t.id)) throw new Error(`Webhook target already registered: ${t.id}`);
  webhookRegistry.set(t.id, t);
}

export function getWebhookTarget(id: string): WebhookTarget<any> | undefined {
  return webhookRegistry.get(id);
}

export function listWebhookTargets(): WebhookTarget<any>[] {
  return [...webhookRegistry.values()];
}

// ------ Subscription (customer-supplied URLs) ------------------------

export interface WebhookSubscription {
  id: string;
  url: string;
  events: (SupportedEvent | '*')[];    // '*' means all
  secret: string;                      // HMAC signing secret
  description?: string;
  active: boolean;
  createdAt: string;
  lastFiredAt?: string;
  failureCount: number;                // rolling counter; sh1pt auto-disables after ~20
}

export interface WebhookSubscriptionInput {
  url: string;
  events: (SupportedEvent | '*')[];
  description?: string;
  // If omitted, sh1pt mints a 32-byte secret and returns it once.
  secret?: string;
}
