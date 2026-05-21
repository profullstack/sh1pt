import { contractTestBot } from '@profullstack/sh1pt-core/testing';
import type { BotHandler } from '@profullstack/sh1pt-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import bot from './index.js';

contractTestBot(bot, { sampleConfig: { homeserver: 'https://matrix.example' }, sampleChannel: '!room:matrix.example' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bot-matrix Client-Server API behavior', () => {
  it('sends Matrix m.room.message events with authenticated idempotent PUTs', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse({ event_id: '$event1:matrix.example' });
    }));

    const result = await bot.send(ctx(), '!room:matrix.example', { text: 'hello matrix' }, {
      homeserver: 'https://matrix.example/',
      transactionIdPrefix: 'test',
      accessToken: 'matrix-access-token',
    });

    expect(result.id).toBe('$event1:matrix.example');
    expect(calls).toHaveLength(1);
    const sendCall = calls[0];
    expect(sendCall).toBeDefined();
    if (!sendCall) throw new Error('missing Matrix send call');
    expect(sendCall.url).toMatch(/^https:\/\/matrix\.example\/_matrix\/client\/v3\/rooms\/!room%3Amatrix\.example\/send\/m\.room\.message\/test-/);
    expect(sendCall.init.method).toBe('PUT');
    expect((sendCall.init.headers as Record<string, string>).Authorization).toBe('Bearer matrix-access-token');
    expect(JSON.parse(String(sendCall.init.body))).toEqual({ msgtype: 'm.text', body: 'hello matrix' });
  });

  it('polls /sync, dispatches text messages as commands, and sends handler replies', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (String(url).includes('/sync?')) {
        return jsonResponse({
          next_batch: 's1',
          rooms: {
            join: {
              '!room:matrix.example': {
                timeline: {
                  events: [{
                    event_id: '$inbound:matrix.example',
                    sender: '@alice:matrix.example',
                    type: 'm.room.message',
                    origin_server_ts: 1779336000000,
                    content: { msgtype: 'm.text', body: '!ping one two' },
                  }],
                },
              },
            },
          },
        });
      }
      return jsonResponse({ event_id: '$reply:matrix.example' });
    }));

    let received!: (value: string) => void;
    const seen = new Promise<string>((resolve) => {
      received = resolve;
    });
    const handlers: BotHandler[] = [{
      match: { type: 'command', command: 'ping' },
      handle: (_ctx, event) => {
        received(JSON.stringify({
          type: event.type,
          channel: event.channel,
          command: event.command,
          args: event.args,
          user: event.user.id,
          text: event.text,
        }));
        return { text: 'pong' };
      },
    }];

    const handle = await bot.register(ctx(), handlers, {
      homeserver: 'https://matrix.example',
      accessToken: 'matrix-access-token',
      userId: '@bot:matrix.example',
      initialSince: 's0',
      syncTimeoutMs: 1,
      pollIntervalMs: 1_000,
      transactionIdPrefix: 'reply',
    });

    try {
      await expect(seen).resolves.toBe(JSON.stringify({
        type: 'command',
        channel: '!room:matrix.example',
        command: 'ping',
        args: ['one', 'two'],
        user: '@alice:matrix.example',
        text: '!ping one two',
      }));
      await waitFor(() => calls.some((call) => call.init.method === 'PUT'));
      const syncCall = calls.find((call) => call.url.includes('/sync?'));
      expect(syncCall?.url).toContain('since=s0');
      const replyCall = calls.find((call) => call.init.method === 'PUT');
      expect(JSON.parse(String(replyCall?.init.body))).toEqual({ msgtype: 'm.text', body: 'pong' });
    } finally {
      await handle.close();
    }
  });

  it('ignores bot-authored events by default', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/sync?')) {
        return jsonResponse({
          next_batch: 's1',
          rooms: {
            join: {
              '!room:matrix.example': {
                timeline: {
                  events: [{
                    sender: '@bot:matrix.example',
                    type: 'm.room.message',
                    content: { msgtype: 'm.text', body: '!ping' },
                  }],
                },
              },
            },
          },
        });
      }
      return jsonResponse({ event_id: '$reply:matrix.example' });
    }));

    const handler = vi.fn();
    const handle = await bot.register(ctx(), [{ match: { type: 'command', command: 'ping' }, handle: handler }], {
      homeserver: 'https://matrix.example',
      accessToken: 'matrix-access-token',
      userId: '@bot:matrix.example',
      initialSince: 's0',
      syncTimeoutMs: 1,
      pollIntervalMs: 1_000,
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(handler).not.toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });
});

function ctx() {
  return {
    dryRun: false,
    log: () => {},
    secret(key: string) {
      return key === 'MATRIX_ACCESS_TOKEN' ? 'matrix-access-token' : undefined;
    },
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

async function waitFor(assertion: () => boolean): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 1000) {
    if (assertion()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('timed out waiting for assertion');
}
