import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestBridge } from '@profullstack/sh1pt-core/testing';
import bridge, {
  mapSignalNotification,
  messagesFromSignalSse,
  renderSignalText,
  signalEventsEndpoint,
  signalRpcEndpoint,
  signalSendParams,
  type SignalBridgeConfig,
} from './index.js';
import type { BridgeMessage } from '@profullstack/sh1pt-core';

const config: SignalBridgeConfig = {
  phoneNumber: '+15551234567',
  runtime: 'signal-cli',
};

const message: BridgeMessage = {
  id: 'src-1',
  channel: 'source',
  identity: { network: 'matrix', username: 'Ada' },
  text: 'hello from bridge',
  attachments: [
    {
      kind: 'file',
      url: 'https://example.test/report.pdf',
      filename: 'report.pdf',
    },
  ],
  timestamp: '2026-05-21T00:00:00.000Z',
};

const originalFetch = globalThis.fetch;

contractTestBridge(bridge, {
  sampleConfig: config,
  sampleChannel: 'group-id-base64',
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('Signal bridge helpers', () => {
  it('derives default JSON-RPC and SSE endpoints', () => {
    expect(signalRpcEndpoint(config).toString()).toBe('http://localhost:8080/api/v1/rpc');
    expect(signalEventsEndpoint(config).toString()).toBe('http://localhost:8080/api/v1/events');

    expect(signalEventsEndpoint({
      ...config,
      rpcEndpoint: 'https://signal.example/custom/rpc',
    }).toString()).toBe('https://signal.example/custom/events');
  });

  it('rejects non-http endpoints', () => {
    expect(() => signalRpcEndpoint({ ...config, rpcEndpoint: 'ws://localhost:8080/rpc' })).toThrow('http(s)');
  });

  it('renders relayed identity and attachment URLs into Signal text', () => {
    expect(renderSignalText(message)).toBe([
      'Ada [matrix]: hello from bridge',
      'report.pdf: https://example.test/report.pdf',
    ].join('\n'));
  });

  it('builds group and direct send params', () => {
    expect(signalSendParams('group-id-base64', message, config)).toMatchObject({
      account: '+15551234567',
      groupId: 'group-id-base64',
      message: expect.stringContaining('Ada [matrix]'),
    });
    expect(signalSendParams('+15557654321', message, config)).toMatchObject({
      recipient: ['+15557654321'],
    });
    expect(signalSendParams('u:signaluser.12', message, config)).toMatchObject({
      recipient: ['u:signaluser.12'],
    });
  });

  it('maps receive notifications into BridgeMessage objects', () => {
    const mapped = mapSignalNotification({
      method: 'receive',
      params: {
        envelope: {
          dataMessage: {
            attachments: [
              {
                contentType: 'image/png',
                filename: 'screen.png',
                path: '/tmp/screen.png',
              },
            ],
            groupInfo: { groupId: 'group-1' },
            message: 'hi from Signal',
            timestamp: Date.parse('2026-05-21T00:00:00.000Z'),
          },
          sourceName: 'Grace',
          sourceNumber: '+15557654321',
        },
      },
    }, config);

    expect(mapped).toMatchObject({
      id: '+15557654321:1779321600000',
      channel: 'group-1',
      identity: { network: 'signal', username: 'Grace' },
      originalNetwork: 'signal',
      text: 'hi from Signal',
      timestamp: '2026-05-21T00:00:00.000Z',
    });
    expect(mapped?.attachments).toEqual([
      {
        filename: 'screen.png',
        kind: 'image',
        mimeType: 'image/png',
        url: '/tmp/screen.png',
      },
    ]);
  });

  it('parses signal-cli SSE data blocks and ignores self echoes', () => {
    const sse = [
      'event: message',
      `data: ${JSON.stringify({
        method: 'receive',
        params: {
          result: {
            envelope: {
              dataMessage: {
                groupInfo: { groupId: 'group-1' },
                message: 'from peer',
                timestamp: 1,
              },
              sourceNumber: '+15557654321',
            },
          },
        },
      })}`,
      '',
      `data: ${JSON.stringify({
        method: 'receive',
        params: {
          envelope: {
            dataMessage: { message: 'self', timestamp: 2 },
            sourceNumber: '+15551234567',
          },
        },
      })}`,
      '',
    ].join('\n');

    expect(messagesFromSignalSse(sse, config).map((msg) => msg.text)).toEqual(['from peer']);
  });
});

describe('Signal bridge network behavior', () => {
  it('sends messages through signal-cli JSON-RPC and redacts phone numbers in errors', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      jsonrpc: '2.0',
      result: { timestamp: 1_779_321_600_000 },
      id: 'send-1',
    }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await bridge.send({
      dryRun: false,
      log: () => undefined,
      secret: () => undefined,
    }, 'group-id-base64', message, config);

    expect(result).toEqual({ id: 'signal:1779321600000' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('http://localhost:8080/api/v1/rpc');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({
      method: 'send',
      params: {
        account: '+15551234567',
        groupId: 'group-id-base64',
        message: expect.stringContaining('hello from bridge'),
      },
    });
  });

  it('redacts configured phone numbers from JSON-RPC errors', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: { code: -32000, message: 'account +15551234567 is not registered' },
      id: 'send-1',
      jsonrpc: '2.0',
    }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(bridge.send({
      dryRun: false,
      log: () => undefined,
      secret: () => undefined,
    }, 'group-id-base64', message, config)).rejects.toThrow('account [redacted-phone:4567] is not registered');
  });

  it('subscribes to signal-cli SSE events and filters watched groups', async () => {
    const encoder = new TextEncoder();
    const events = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          method: 'receive',
          params: {
            envelope: {
              dataMessage: {
                groupInfo: { groupId: 'group-1' },
                message: 'watched',
                timestamp: Date.parse('2026-05-21T00:00:00.000Z'),
              },
              sourceName: 'Alice',
              sourceNumber: '+15557654321',
            },
          },
        })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          method: 'receive',
          params: {
            envelope: {
              dataMessage: {
                groupInfo: { groupId: 'other-group' },
                message: 'ignored',
                timestamp: Date.parse('2026-05-21T00:00:01.000Z'),
              },
              sourceName: 'Bob',
              sourceNumber: '+15550000000',
            },
          },
        })}\n\n`));
        controller.close();
      },
    });

    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/events')) {
        return new Response(events, {
          headers: { 'content-type': 'text/event-stream' },
          status: 200,
        });
      }
      return new Response(JSON.stringify({ jsonrpc: '2.0', result: 7, id: 'sub-1' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const received: BridgeMessage[] = [];
    const subscription = await bridge.subscribe({
      log: () => undefined,
      secret: () => undefined,
    }, ['group-1'], (msg) => {
      received.push(msg);
    }, config);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await subscription.close();

    expect(received.map((msg) => msg.text)).toEqual(['watched']);
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/api/v1/events' }), expect.any(Object));
  });
});
