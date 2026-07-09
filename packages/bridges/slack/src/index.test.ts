import { smokeTest } from '@profullstack/sh1pt-core/testing';
import type { BridgeMessage } from '@profullstack/sh1pt-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'bridge' });

const defaultSecrets = {
  SLACK_APP_TOKEN: 'xapp-test',
  SLACK_BOT_TOKEN: 'xoxb-test',
};

const sendCtx = (secrets: Record<string, string | undefined> = defaultSecrets, dryRun = false) => ({
  secret: (key: string) => secrets[key],
  log: vi.fn(),
  dryRun,
});

const subscribeCtx = (secrets: Record<string, string | undefined> = defaultSecrets, signal?: AbortSignal) => ({
  secret: (key: string) => secrets[key],
  log: vi.fn(),
  signal,
});

const sampleMessage = (): BridgeMessage => ({
  id: 'discord-1',
  channel: 'general',
  identity: {
    network: 'discord',
    username: 'Ada',
    avatarUrl: 'https://avatar.example/ada.png',
  },
  text: 'hi from discord',
  attachments: [{
    url: 'https://cdn.example/file.png',
    filename: 'file.png',
    kind: 'image',
    mimeType: 'image/png',
  }],
  timestamp: '2026-05-21T00:00:00.000Z',
  originalNetwork: 'discord',
});

class FakeSocket {
  static instances: FakeSocket[] = [];

  closed = false;
  onmessage?: (event: { data: string }) => void | Promise<void>;
  sent: string[] = [];

  constructor(public readonly url: string) {
    FakeSocket.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  send(data: string): void {
    this.sent.push(data);
  }
}

afterEach(() => {
  FakeSocket.instances = [];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('bridge-slack adapter', () => {
  it('requires Slack tokens for live send and subscribe', async () => {
    await expect(adapter.send(sendCtx({}), 'C123', sampleMessage(), {})).rejects.toThrow('SLACK_BOT_TOKEN');
    await expect(adapter.subscribe(subscribeCtx({ SLACK_APP_TOKEN: 'xapp-test' }), ['C123'], vi.fn(), {}))
      .rejects.toThrow('SLACK_APP_TOKEN + SLACK_BOT_TOKEN');
  });

  it('keeps dry-run send side-effect free', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.send(sendCtx(defaultSecrets, true), 'C123', sampleMessage(), {})).resolves.toEqual({
      id: 'dry-run',
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts relayed messages through chat.postMessage', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      ts: '1716210001.000200',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.send(sendCtx(), 'C123', sampleMessage(), {})).resolves.toEqual({
      id: '1716210001.000200',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchCall(fetchMock);
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect(request).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Bearer xoxb-test',
        'content-type': 'application/json; charset=utf-8',
      },
    });
    expect(JSON.parse(String(request.body))).toEqual({
      channel: 'C123',
      text: 'Ada [discord]: hi from discord\nhttps://cdn.example/file.png',
      username: 'Ada [discord]',
      icon_url: 'https://avatar.example/ada.png',
      unfurl_links: false,
      unfurl_media: false,
    });
  });

  it('opens Slack Socket Mode and maps subscribed message events', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      url: 'wss://slack.example/socket',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('WebSocket', FakeSocket);

    const onMessage = vi.fn();
    const subscription = await adapter.subscribe(subscribeCtx(), ['C-allowed'], onMessage, {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchCall(fetchMock);
    expect(url).toBe('https://slack.com/api/apps.connections.open');
    expect(request).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Bearer xapp-test',
        'content-type': 'application/json; charset=utf-8',
      },
    });

    const socket = FakeSocket.instances[0]!;
    expect(socket.url).toBe('wss://slack.example/socket');

    await socket.onmessage?.({
      data: JSON.stringify({
        envelope_id: 'env-1',
        type: 'events_api',
        payload: {
          event: {
            type: 'message',
            channel: 'C-other',
            user: 'U999',
            text: 'ignored',
            ts: '1716210000.000100',
          },
        },
      }),
    });

    expect(socket.sent).toEqual([JSON.stringify({ envelope_id: 'env-1' })]);
    expect(onMessage).not.toHaveBeenCalled();

    await socket.onmessage?.({
      data: JSON.stringify({
        envelope_id: 'env-2',
        type: 'events_api',
        payload: {
          event: {
            type: 'message',
            channel: 'C-allowed',
            bot_id: 'B123',
            bot_profile: {
              name: 'Deploy Bot',
              icons: { image_72: 'https://avatar.example/bot.png' },
            },
            text: 'release shipped',
            files: [{
              url_private: 'https://files.example/report.pdf',
              name: 'report.pdf',
              mimetype: 'application/pdf',
            }],
            event_ts: '1716210001.000200',
            ts: '1716210001.000200',
          },
        },
      }),
    });

    expect(socket.sent).toEqual([
      JSON.stringify({ envelope_id: 'env-1' }),
      JSON.stringify({ envelope_id: 'env-2' }),
    ]);
    expect(onMessage).toHaveBeenCalledWith({
      id: '1716210001.000200',
      channel: 'C-allowed',
      identity: {
        network: 'slack',
        username: 'Deploy Bot',
        avatarUrl: 'https://avatar.example/bot.png',
        isBot: true,
      },
      text: 'release shipped',
      attachments: [{
        url: 'https://files.example/report.pdf',
        filename: 'report.pdf',
        mimeType: 'application/pdf',
        kind: 'file',
      }],
      timestamp: new Date(1716210001 * 1000).toISOString(),
      originalNetwork: 'slack',
    });

    await subscription.close();
    expect(socket.closed).toBe(true);
  });

  it('redacts Slack tokens from API errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: 'token xoxb-secret rejected',
    }), { status: 200 })));

    let error: Error | undefined;
    try {
      await adapter.send(sendCtx({ SLACK_BOT_TOKEN: 'xoxb-secret' }), 'C123', sampleMessage(), {});
    } catch (err) {
      error = err as Error;
    }

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain('token [redacted] rejected');
    expect(error?.message).not.toContain('xoxb-secret');
  });
});

function fetchCall(fetchMock: ReturnType<typeof vi.fn>): [string, RequestInit] {
  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error('fetch was not called');
  return call as unknown as [string, RequestInit];
}
