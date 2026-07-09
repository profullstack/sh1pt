import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestBridge } from '@profullstack/sh1pt-core/testing';
import bridge, {
  mapMatrixEvent,
  matrixApiUrl,
  matrixTokenSecret,
  matrixTransactionId,
  matrixUserIdForIdentity,
  messagesFromSync,
  normalizeHomeserver,
  renderMatrixTextContent,
  type MatrixBridgeConfig,
} from './index.js';
import type { BridgeMessage } from '@profullstack/sh1pt-core';

const config: MatrixBridgeConfig = {
  homeserver: 'https://matrix.example/',
  userId: '@bridge:example.org',
};

const message: BridgeMessage = {
  id: 'src:1',
  channel: 'source',
  identity: { network: 'discord', username: 'Ada <Lovelace>' },
  text: 'hello & welcome',
  attachments: [
    {
      kind: 'image',
      url: 'https://cdn.example/image.png',
      filename: 'diagram.png',
    },
  ],
  timestamp: '2026-05-21T00:00:00.000Z',
};

const originalFetch = globalThis.fetch;

contractTestBridge(bridge, {
  sampleConfig: config,
  sampleChannel: '!room:example.org',
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('Matrix bridge helpers', () => {
  it('normalizes Matrix homeserver URLs', () => {
    expect(normalizeHomeserver('https://matrix.example///')).toBe('https://matrix.example');
    expect(() => normalizeHomeserver('ftp://matrix.example')).toThrow('http(s)');
  });

  it('builds API URLs with Matrix query parameters', () => {
    const url = matrixApiUrl(config, '/_matrix/client/v3/sync', {
      since: 's1',
      timeout: '0',
    });

    expect(url.toString()).toBe('https://matrix.example/_matrix/client/v3/sync?since=s1&timeout=0');
  });

  it('selects normal and appservice token secrets', () => {
    expect(matrixTokenSecret(config)).toBe('MATRIX_BRIDGE_ACCESS_TOKEN');
    expect(matrixTokenSecret({
      ...config,
      appservice: { id: 'sh1pt', namespacePrefix: '@sh1pt_' },
    })).toBe('MATRIX_APP_SERVICE_TOKEN');
    expect(matrixTokenSecret({
      ...config,
      accessTokenSecret: 'CUSTOM_MATRIX_TOKEN',
    })).toBe('CUSTOM_MATRIX_TOKEN');
  });

  it('renders text content with escaped formatted HTML', () => {
    const content = renderMatrixTextContent(message);

    expect(content.body).toContain('Ada <Lovelace> [discord]: hello & welcome');
    expect(content.body).toContain('diagram.png: https://cdn.example/image.png');
    expect(content.formatted_body).toContain('Ada &lt;Lovelace&gt;');
    expect(content.formatted_body).toContain('hello &amp; welcome');
    expect(content.formatted_body).toContain('href="https://cdn.example/image.png"');
  });

  it('creates stable transaction ids and appservice virtual users', () => {
    expect(matrixTransactionId(message)).toBe('sh1pt-discord-src-1');
    expect(matrixUserIdForIdentity(message, {
      ...config,
      appservice: { id: 'sh1pt', namespacePrefix: '@sh1pt_' },
    })).toBe('@sh1pt_discord_ada_lovelace:example.org');
  });

  it('maps Matrix m.room.message events and ignores echoes', () => {
    const mapped = mapMatrixEvent({
      content: { body: 'hi from Matrix', msgtype: 'm.text' },
      event_id: '$event',
      origin_server_ts: Date.parse('2026-05-21T00:00:00.000Z'),
      sender: '@alice:example.org',
      type: 'm.room.message',
    }, '!room:example.org', config);

    expect(mapped).toMatchObject({
      id: '$event',
      channel: '!room:example.org',
      identity: { network: 'matrix', username: 'alice' },
      text: 'hi from Matrix',
      timestamp: '2026-05-21T00:00:00.000Z',
      originalNetwork: 'matrix',
    });

    expect(mapMatrixEvent({
      content: { body: 'self', msgtype: 'm.text' },
      event_id: '$self',
      sender: '@bridge:example.org',
      type: 'm.room.message',
    }, '!room:example.org', config)).toBeUndefined();
  });

  it('extracts subscribed room timeline messages from /sync responses', () => {
    const messages = messagesFromSync({
      next_batch: 's2',
      rooms: {
        join: {
          '!room:example.org': {
            timeline: {
              events: [
                {
                  content: { body: 'file.pdf', info: { mimetype: 'application/pdf' }, msgtype: 'm.file', url: 'mxc://example/file' },
                  event_id: '$file',
                  sender: '@alice:example.org',
                  type: 'm.room.message',
                },
              ],
            },
          },
          '!other:example.org': {
            timeline: {
              events: [
                {
                  content: { body: 'ignored', msgtype: 'm.text' },
                  event_id: '$other',
                  sender: '@bob:example.org',
                  type: 'm.room.message',
                },
              ],
            },
          },
        },
      },
    }, ['!room:example.org'], config);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.attachments).toEqual([
      {
        url: 'mxc://example/file',
        kind: 'file',
        filename: 'file.pdf',
        mimeType: 'application/pdf',
      },
    ]);
  });
});

describe('Matrix bridge network behavior', () => {
  it('sends m.room.message events with bearer auth and returns Matrix event ids', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ event_id: '$matrix-event' }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await bridge.send({
      dryRun: false,
      log: () => undefined,
      secret: (key: string) => key === 'MATRIX_BRIDGE_ACCESS_TOKEN' ? 'mx-token' : undefined,
    }, '!room:example.org', message, config);

    expect(result).toEqual({ id: '$matrix-event' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('https://matrix.example/_matrix/client/v3/rooms/!room%3Aexample.org/send/m.room.message/sh1pt-discord-src-1');
    expect(init.method).toBe('PUT');
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer mx-token');
    expect(JSON.parse(String(init.body))).toMatchObject({
      body: expect.stringContaining('Ada <Lovelace> [discord]'),
      msgtype: 'm.text',
    });
  });

  it('redacts bearer tokens from Matrix error messages', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      errcode: 'M_UNKNOWN_TOKEN',
      error: 'mx-token was rejected',
    }), {
      headers: { 'content-type': 'application/json' },
      status: 401,
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(bridge.send({
      dryRun: false,
      log: () => undefined,
      secret: () => 'mx-token',
    }, '!room:example.org', message, config)).rejects.toThrow('Matrix request failed (401 M_UNKNOWN_TOKEN): [redacted] was rejected');
  });

  it('subscribes through /sync and emits messages from watched rooms', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      next_batch: 's2',
      rooms: {
        join: {
          '!room:example.org': {
            timeline: {
              events: [
                {
                  content: { body: 'hello from sync', msgtype: 'm.text' },
                  event_id: '$sync',
                  origin_server_ts: Date.parse('2026-05-21T00:00:00.000Z'),
                  sender: '@alice:example.org',
                  type: 'm.room.message',
                },
              ],
            },
          },
        },
      },
    }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    const received: BridgeMessage[] = [];
    const subscription = await bridge.subscribe({
      log: () => undefined,
      secret: () => 'mx-token',
    }, ['!room:example.org'], (msg) => {
      received.push(msg);
    }, {
      ...config,
      deliverInitial: true,
      pollIntervalMs: 1,
      syncTimeoutMs: 0,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    await subscription.close();

    expect(received[0]).toMatchObject({
      id: '$sync',
      channel: '!room:example.org',
      text: 'hello from sync',
    });
    expect(fetchMock).toHaveBeenCalled();
    const [url] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.searchParams.get('timeout')).toBe('0');
  });
});
