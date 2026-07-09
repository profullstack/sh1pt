import { describe, expect, it, vi } from 'vitest';
import { contractTestBridge } from '@profullstack/sh1pt-core/testing';
import { finalizeEvent, generateSecretKey, getPublicKey, nip19, verifyEvent, type Event as NostrEvent, type Filter } from 'nostr-tools';
import bridge, {
  buildNostrEventTemplate,
  mapNostrEvent,
  normalizeNostrChannel,
  nostrFiltersForChannels,
  nostrTagsForChannel,
  parseNostrPrivateKey,
  renderNostrContent,
  type NostrBridgeConfig,
  type NostrPoolLike,
} from './index.js';
import type { BridgeMessage } from '@profullstack/sh1pt-core';

class FakePool implements NostrPoolLike {
  subscriptions: Array<{
    relays: string[];
    filter: Filter;
    params: {
      onevent?: (event: NostrEvent) => void;
    };
    close: ReturnType<typeof vi.fn>;
  }> = [];
  published: Array<{ relays: string[]; event: NostrEvent }> = [];
  publishResults: Promise<string>[] | undefined;
  destroyed = false;

  subscribeMany(relays: string[], filter: Filter, params: { onevent?: (event: NostrEvent) => void }) {
    const close = vi.fn();
    this.subscriptions.push({ relays, filter, params, close });
    return { close };
  }

  publish(relays: string[], event: NostrEvent): Promise<string>[] {
    this.published.push({ relays, event });
    return this.publishResults ?? relays.map((relay) => Promise.resolve(relay));
  }

  destroy() {
    this.destroyed = true;
  }
}

const privateKey = generateSecretKey();
const nsec = nip19.nsecEncode(privateKey);
const publicKey = getPublicKey(privateKey);
const relays = ['wss://relay.example.com', 'wss://backup.example.com'];
const config: NostrBridgeConfig = { relays };

const sampleMessage: BridgeMessage = {
  id: 'source-1',
  channel: 'general',
  identity: { network: 'matrix', username: 'Ada' },
  text: 'hello nostr',
  attachments: [
    {
      filename: 'report.txt',
      kind: 'file',
      url: 'https://example.test/report.txt',
    },
  ],
  timestamp: '2026-05-21T00:00:00.000Z',
};

contractTestBridge(bridge, {
  sampleConfig: config,
  sampleChannel: '#bridge',
});

describe('Nostr bridge helpers', () => {
  it('renders relayed identity and attachments into content', () => {
    expect(renderNostrContent(sampleMessage)).toBe([
      'Ada [matrix]: hello nostr',
      'report.txt: https://example.test/report.txt',
    ].join('\n'));
  });

  it('normalizes hashtags, hex pubkeys, and npub channels', () => {
    expect(normalizeNostrChannel('#bridge')).toEqual({ type: 'topic', value: 'bridge', display: '#bridge' });
    expect(normalizeNostrChannel(publicKey)).toEqual({ type: 'pubkey', value: publicKey, display: publicKey });
    expect(normalizeNostrChannel(nip19.npubEncode(publicKey))).toEqual({
      type: 'pubkey',
      value: publicKey,
      display: nip19.npubEncode(publicKey),
    });
  });

  it('splits topic and author subscriptions into OR filters', () => {
    expect(nostrFiltersForChannels(['#bridge', publicKey], {
      ...config,
      filterKinds: [1, 30023],
      limit: 10,
      since: 1_779_321_600,
    })).toEqual([
      { '#t': ['bridge'], kinds: [1, 30023], limit: 10, since: 1_779_321_600 },
      { authors: [publicKey], kinds: [1, 30023], limit: 10, since: 1_779_321_600 },
    ]);
  });

  it('builds event tags and templates', () => {
    expect(nostrTagsForChannel('#bridge', sampleMessage)).toEqual([
      ['client', 'sh1pt'],
      ['t', 'bridge'],
      ['r', 'https://example.test/report.txt'],
    ]);

    expect(buildNostrEventTemplate('#bridge', sampleMessage, config, 1_779_321_600)).toMatchObject({
      content: expect.stringContaining('hello nostr'),
      created_at: 1_779_321_600,
      kind: 1,
      tags: expect.arrayContaining([['t', 'bridge']]),
    });
  });

  it('parses nsec and hex private keys', () => {
    expect(parseNostrPrivateKey(nsec)).toEqual(privateKey);
    expect(parseNostrPrivateKey(Buffer.from(privateKey).toString('hex'))).toEqual(privateKey);
    expect(() => parseNostrPrivateKey('not-a-key')).toThrow('nsec or 32-byte hex');
  });

  it('maps Nostr events to bridge messages', () => {
    const event = finalizeEvent({
      content: 'hello from nostr',
      created_at: 1_779_321_600,
      kind: 1,
      tags: [['t', 'bridge']],
    }, privateKey);

    expect(mapNostrEvent(event, ['#bridge'])).toMatchObject({
      id: event.id,
      channel: '#bridge',
      identity: { network: 'nostr', username: nip19.npubEncode(publicKey) },
      originalNetwork: 'nostr',
      text: 'hello from nostr',
      timestamp: '2026-05-21T00:00:00.000Z',
    });
  });
});

describe('Nostr bridge network behavior', () => {
  it('signs and publishes events to all configured relays', async () => {
    const pool = new FakePool();
    const result = await bridge.send({
      dryRun: false,
      log: () => undefined,
      secret: (name) => name === 'NOSTR_BRIDGE_PRIVATE_KEY' ? nsec : undefined,
    }, '#bridge', sampleMessage, {
      ...config,
      pool,
    });

    expect(result.id).toMatch(/^[0-9a-f]{64}$/);
    expect(pool.published).toHaveLength(1);
    expect(pool.published[0]?.relays).toEqual(relays.map((relay) => `${relay}/`));
    expect(verifyEvent(pool.published[0]!.event)).toBe(true);
    expect(pool.published[0]?.event).toMatchObject({
      id: result.id,
      kind: 1,
      pubkey: publicKey,
      tags: expect.arrayContaining([['t', 'bridge'], ['client', 'sh1pt']]),
    });
  });

  it('fails when every relay rejects a publish without leaking the key', async () => {
    const pool = new FakePool();
    pool.publishResults = [
      Promise.reject(new Error(`bad ${nsec}`)),
      Promise.reject(new Error(`bad ${Buffer.from(privateKey).toString('hex')}`)),
    ];

    await expect(bridge.send({
      dryRun: false,
      log: () => undefined,
      secret: () => nsec,
    }, '#bridge', sampleMessage, {
      ...config,
      pool,
    })).rejects.toThrow('[redacted-nsec]');
  });

  it('subscribes to Nostr filters, ignores self echoes, and forwards peer events', async () => {
    const pool = new FakePool();
    const received: BridgeMessage[] = [];
    const subscription = await bridge.subscribe({
      log: () => undefined,
      secret: () => nsec,
    }, ['#bridge'], (message) => {
      received.push(message);
    }, {
      ...config,
      pool,
    });

    const peerKey = generateSecretKey();
    const peerEvent = finalizeEvent({
      content: 'from peer',
      created_at: 1_779_321_600,
      kind: 1,
      tags: [['t', 'bridge']],
    }, peerKey);
    const selfEvent = finalizeEvent({
      content: 'from self',
      created_at: 1_779_321_601,
      kind: 1,
      tags: [['t', 'bridge']],
    }, privateKey);

    pool.subscriptions[0]?.params.onevent?.(peerEvent);
    pool.subscriptions[0]?.params.onevent?.(selfEvent);
    await subscription.close();

    expect(pool.subscriptions).toHaveLength(1);
    expect(pool.subscriptions[0]?.filter).toEqual({ '#t': ['bridge'], kinds: [1] });
    expect(pool.subscriptions[0]?.close).toHaveBeenCalledWith('sh1pt bridge closing');
    expect(received.map((message) => message.text)).toEqual(['from peer']);
  });
});
