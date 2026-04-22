import { autoSetup } from './setup-helpers.js';

// Communications bridge — cross-post messages between chat networks.
// Slack ↔ Discord ↔ IRC ↔ Signal ↔ Matrix ↔ Mastodon ↔ Nostr ↔ Telegram.
//
// Different from webhook-* (one-way outbound) and chat-* (bot-target
// deployment). A bridge SUBSCRIBES to inbound messages on one network,
// translates identity + attachments, and SENDS to peer networks.
//
// Inspired by Matterbridge — sh1pt's version is adapter-per-network
// with the same vault-first secret model as everything else.

export interface BridgeIdentity {
  network: string;                  // 'discord', 'slack', 'irc', etc.
  username: string;                 // display name on the source network
  avatarUrl?: string;
  isBot?: boolean;                  // suppress or flag depending on route rules
}

export interface BridgeAttachment {
  url: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  filename?: string;
  mimeType?: string;
}

export interface BridgeMessage {
  id: string;                       // provider-native message id
  channel: string;                  // provider-native channel id
  identity: BridgeIdentity;
  text: string;
  replyToId?: string;
  attachments?: BridgeAttachment[];
  timestamp: string;
  // Preserved when relaying so the peer can flag or filter self-echoes.
  originalNetwork?: string;
}

export interface BridgeRoute {
  from: string;                     // '<network>:<channel>', e.g. 'discord:123456789012'
  to: string[];                     // array of '<network>:<channel>' destinations
  // Optional filters — drop bot echoes, strip pings, redact URLs, etc.
  filters?: ('no-bots' | 'no-pings' | 'no-links' | 'no-emojis')[];
  // Per-route identity rendering. Default: "<username> [<network>]: <text>"
  identityFormat?: string;
}

export interface BridgeNetwork<Config = unknown> {
  id: string;                       // 'bridge-discord', 'bridge-slack', etc.
  label: string;
  // Open a live connection (websocket / streaming API / poll loop) and
  // call onMessage for each new message in any subscribed channel.
  subscribe(
    ctx: { secret(k: string): string | undefined; log(m: string): void; signal?: AbortSignal },
    channels: string[],
    onMessage: (msg: BridgeMessage) => Promise<void> | void,
    config: Config,
  ): Promise<{ close(): Promise<void> }>;
  // Deliver a relayed message to a destination channel on THIS network.
  // Adapters choose how to render identity + attachments natively
  // (Discord embeds, Slack blocks, IRC fallback URL, Matrix m.image, …).
  send(
    ctx: { secret(k: string): string | undefined; log(m: string): void; dryRun: boolean },
    channel: string,
    msg: BridgeMessage,
    config: Config,
  ): Promise<{ id: string }>;
}

export function defineBridge<Config>(b: BridgeNetwork<Config>): BridgeNetwork<Config> {
  return autoSetup(b);
}

const bridgeRegistry = new Map<string, BridgeNetwork<any>>();

export function registerBridge(b: BridgeNetwork<any>): void {
  if (bridgeRegistry.has(b.id)) throw new Error(`Bridge already registered: ${b.id}`);
  bridgeRegistry.set(b.id, b);
}

export function getBridge(id: string): BridgeNetwork<any> | undefined {
  return bridgeRegistry.get(id);
}

export function listBridges(): BridgeNetwork<any>[] {
  return [...bridgeRegistry.values()];
}
