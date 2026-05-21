import { defineBridge, tokenSetup, type BridgeMessage } from '@profullstack/sh1pt-core';
import {
  SimplePool,
  finalizeEvent,
  getPublicKey,
  nip19,
  type Event as NostrEvent,
  type EventTemplate,
  type Filter,
} from 'nostr-tools';

export interface NostrBridgeConfig {
  relays: string[];
  filterKinds?: number[];
  kind?: number;
  limit?: number;
  since?: number;
  subscriptionId?: string;
  connectTimeoutMs?: number;
  publishTimeoutMs?: number;
  pool?: NostrPoolLike;
}

export interface NostrPoolLike {
  subscribeMany(
    relays: string[],
    filter: Filter,
    params: {
      abort?: AbortSignal;
      id?: string;
      label?: string;
      maxWait?: number;
      onevent?: (event: NostrEvent) => void;
      onclose?: (reasons: string[]) => void;
    },
  ): { close(reason?: string): void };
  publish(
    relays: string[],
    event: NostrEvent,
    params?: { abort?: AbortSignal; maxWait?: number },
  ): Promise<string>[];
  destroy?(): void;
}

type NostrChannel =
  | { type: 'topic'; value: string; display: string }
  | { type: 'pubkey'; value: string; display: string };

const DEFAULT_KINDS = [1];
const DEFAULT_TIMEOUT_MS = 5_000;
const HEX_32_BYTES = /^[0-9a-f]{64}$/i;

export function renderNostrContent(msg: BridgeMessage): string {
  const network = msg.originalNetwork ?? msg.identity.network;
  const lines = [`${msg.identity.username} [${network}]: ${msg.text || '(no text)'}`];

  for (const attachment of msg.attachments ?? []) {
    lines.push(`${attachment.filename ?? attachment.kind}: ${attachment.url}`);
  }

  return lines.join('\n');
}

export function normalizeNostrChannel(channel: string): NostrChannel {
  const value = channel.trim();
  if (!value) throw new Error('Nostr channel must not be empty');

  if (value.startsWith('npub1')) {
    const decoded = nip19.decode(value);
    if (decoded.type !== 'npub') throw new Error(`Unsupported Nostr channel encoding: ${decoded.type}`);
    return { type: 'pubkey', value: decoded.data.toLowerCase(), display: value };
  }

  if (HEX_32_BYTES.test(value)) {
    return { type: 'pubkey', value: value.toLowerCase(), display: value.toLowerCase() };
  }

  const topic = value.startsWith('#') ? value.slice(1) : value;
  if (!topic) throw new Error('Nostr hashtag channel must not be empty');
  return { type: 'topic', value: topic, display: `#${topic}` };
}

export function nostrFiltersForChannels(channels: string[], config: NostrBridgeConfig): Filter[] {
  const kinds = config.filterKinds ?? DEFAULT_KINDS;
  const base: Filter = { kinds };
  if (config.since !== undefined) base.since = config.since;
  if (config.limit !== undefined) base.limit = config.limit;

  if (channels.length === 0) return [base];

  const topics = new Set<string>();
  const authors = new Set<string>();

  for (const channel of channels) {
    const normalized = normalizeNostrChannel(channel);
    if (normalized.type === 'topic') topics.add(normalized.value);
    if (normalized.type === 'pubkey') authors.add(normalized.value);
  }

  const filters: Filter[] = [];
  if (topics.size > 0) filters.push({ ...base, '#t': [...topics] });
  if (authors.size > 0) filters.push({ ...base, authors: [...authors] });
  return filters;
}

export function nostrTagsForChannel(channel: string, msg: BridgeMessage): string[][] {
  const normalized = normalizeNostrChannel(channel);
  const tags = [['client', 'sh1pt']];

  if (normalized.type === 'topic') tags.push(['t', normalized.value]);
  if (normalized.type === 'pubkey') tags.push(['p', normalized.value]);

  if (msg.replyToId && HEX_32_BYTES.test(msg.replyToId)) {
    tags.push(['e', msg.replyToId.toLowerCase()]);
  }

  for (const attachment of msg.attachments ?? []) {
    tags.push(['r', attachment.url]);
  }

  return tags;
}

export function buildNostrEventTemplate(
  channel: string,
  msg: BridgeMessage,
  config: NostrBridgeConfig,
  createdAt = Math.floor(Date.now() / 1000),
): EventTemplate {
  return {
    content: renderNostrContent(msg),
    created_at: createdAt,
    kind: config.kind ?? 1,
    tags: nostrTagsForChannel(channel, msg),
  };
}

export function mapNostrEvent(event: NostrEvent, watchedChannels: string[] = []): BridgeMessage | undefined {
  if (!event.id || !event.pubkey) return undefined;

  const watched = watchedChannels.map((channel) => normalizeNostrChannel(channel));
  const topicTags = event.tags.filter((tag) => tag[0] === 't' && tag[1]).map((tag) => tag[1] as string);
  const matchedTopic = watched.find((channel) => channel.type === 'topic' && topicTags.includes(channel.value));
  const matchedAuthor = watched.find((channel) => channel.type === 'pubkey' && channel.value === event.pubkey);
  const firstTopic = topicTags[0];
  const channel = matchedTopic?.display ?? matchedAuthor?.display ?? (firstTopic ? `#${firstTopic}` : event.pubkey);

  return {
    id: event.id,
    channel,
    identity: {
      network: 'nostr',
      username: nip19.npubEncode(event.pubkey),
    },
    originalNetwork: 'nostr',
    text: event.content,
    timestamp: timestampFromNostr(event.created_at),
  };
}

export function parseNostrPrivateKey(value: string): Uint8Array {
  const trimmed = value.trim();
  if (trimmed.startsWith('nsec1')) {
    const decoded = nip19.decode(trimmed);
    if (decoded.type !== 'nsec') throw new Error(`Unsupported Nostr private key encoding: ${decoded.type}`);
    return decoded.data;
  }

  if (!HEX_32_BYTES.test(trimmed)) {
    throw new Error('Nostr private key must be nsec or 32-byte hex');
  }

  return hexToBytes(trimmed);
}

function requirePrivateKey(
  ctx: { secret(k: string): string | undefined },
): Uint8Array {
  const raw = ctx.secret('NOSTR_BRIDGE_PRIVATE_KEY') ?? ctx.secret('NOSTR_NSEC') ?? ctx.secret('NOSTR_PRIVATE_KEY');
  if (!raw) throw new Error('NOSTR_BRIDGE_PRIVATE_KEY not in vault');
  return parseNostrPrivateKey(raw);
}

function requireRelays(config: NostrBridgeConfig): string[] {
  if (config.relays.length === 0) throw new Error('Nostr bridge requires at least one relay');
  return config.relays.map((relay) => normalizeRelayUrl(relay).toString());
}

function normalizeRelayUrl(relay: string): URL {
  const url = new URL(relay.trim());
  if (url.protocol !== 'wss:' && url.protocol !== 'ws:') {
    throw new Error('Nostr relay URL must use ws(s)');
  }
  return url;
}

function createPool(config: NostrBridgeConfig): NostrPoolLike {
  return config.pool ?? new SimplePool({ enableReconnect: false });
}

function timestampFromNostr(createdAt: number): string {
  const date = new Date(createdAt * 1000);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function hexToBytes(hex: string): Uint8Array {
  const pairs = hex.toLowerCase().match(/.{1,2}/g);
  if (!pairs || pairs.length !== 32) throw new Error('Nostr private key must be 32 bytes');
  return Uint8Array.from(pairs.map((pair) => Number.parseInt(pair, 16)));
}

function linkAbortSignal(parent: AbortSignal | undefined): AbortController {
  const controller = new AbortController();
  if (!parent) return controller;

  if (parent.aborted) {
    controller.abort(parent.reason);
  } else {
    parent.addEventListener('abort', () => controller.abort(parent.reason), { once: true });
  }

  return controller;
}

function redactNostrSecret(message: string): string {
  return message
    .replace(/nsec1[023456789acdefghjklmnpqrstuvwxyz]+/gi, '[redacted-nsec]')
    .replace(/\b[0-9a-f]{64}\b/gi, '[redacted-hex-key]');
}

export default defineBridge<NostrBridgeConfig>({
  id: 'bridge-nostr',
  label: 'Nostr',

  async subscribe(ctx, channels, onMessage, config) {
    const relays = requireRelays(config);
    const privateKey = requirePrivateKey(ctx);
    const ownPubkey = getPublicKey(privateKey);
    const filters = nostrFiltersForChannels(channels, config);
    const pool = createPool(config);
    const controller = linkAbortSignal(ctx.signal);
    const closers = filters.map((filter, index) => pool.subscribeMany(relays, filter, {
      abort: controller.signal,
      id: config.subscriptionId ? `${config.subscriptionId}-${index}` : `sh1pt-bridge-nostr-${index}`,
      label: 'sh1pt bridge nostr',
      maxWait: config.connectTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      onevent: (event) => {
        if (event.pubkey === ownPubkey) return;
        const mapped = mapNostrEvent(event, channels);
        if (mapped) void onMessage(mapped);
      },
      onclose: (reasons) => {
        if (!controller.signal.aborted) ctx.log(`nostr bridge subscription closed: ${reasons.join('; ')}`);
      },
    }));

    ctx.log(`nostr bridge · relays=${relays.length} · filters=${filters.length}`);

    return {
      async close() {
        controller.abort();
        for (const closer of closers) closer.close('sh1pt bridge closing');
        if (!config.pool) pool.destroy?.();
      },
    };
  },

  async send(ctx, channel, msg, config) {
    const relays = requireRelays(config);
    ctx.log(`nostr bridge · publish ${channel} · relays=${relays.length}`);
    if (ctx.dryRun) return { id: 'dry-run' };

    const privateKey = requirePrivateKey(ctx);
    const event = finalizeEvent(buildNostrEventTemplate(channel, msg, config), privateKey);
    const pool = createPool(config);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.publishTimeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const results = await Promise.allSettled(pool.publish(relays, event, {
        abort: controller.signal,
        maxWait: config.publishTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      }));
      const accepted = results.filter((result) => result.status === 'fulfilled');
      if (accepted.length === 0) {
        const reasons = results
          .map((result) => result.status === 'rejected' ? redactNostrSecret(String(result.reason)) : '')
          .filter(Boolean)
          .join('; ');
        throw new Error(`nostr publish failed on ${relays.length} relay(s)${reasons ? `: ${reasons}` : ''}`);
      }
      return { id: event.id };
    } finally {
      clearTimeout(timer);
      if (!config.pool) pool.destroy?.();
    }
  },

  setup: tokenSetup({
    secretKey: 'NOSTR_BRIDGE_PRIVATE_KEY',
    label: 'Nostr bridge',
    vendorDocUrl: 'https://github.com/nostr-protocol/nips/blob/master/01.md',
    steps: [
      'Create or choose a dedicated Nostr key for bridge traffic',
      'Store the nsec or 32-byte hex private key as NOSTR_BRIDGE_PRIVATE_KEY',
      'Configure one or more ws(s) relay URLs in sh1pt.config.ts',
    ],
  }),
});
