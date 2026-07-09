import { contractTestBot } from '@profullstack/sh1pt-core/testing';
import type { BotHandler } from '@profullstack/sh1pt-core';
import { generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import bot from './index.js';

contractTestBot(bot, { sampleConfig: { from: '+15551234567' }, sampleChannel: '+15559876543' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bot-telnyx REST behavior', () => {
  it('sends SMS messages through the Messages API', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse({ data: { id: '4032b9f2-85ef-4b99-8a8e-a7392d0a1d7c' } });
    }));

    const result = await bot.send(ctx(), '+15559876543', { text: 'hello sms' }, {
      from: '+15551234567',
      messagingProfileId: '40000000-0000-4000-8000-000000000001',
    });

    expect(result.id).toBe('4032b9f2-85ef-4b99-8a8e-a7392d0a1d7c');
    expect(calls[0]?.url).toBe('https://api.telnyx.com/v2/messages');
    expect(calls[0]?.init.method).toBe('POST');
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe('Bearer telnyx-api-key');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      from: '+15551234567',
      to: '+15559876543',
      text: 'hello sms',
      messaging_profile_id: '40000000-0000-4000-8000-000000000001',
    });
  });

  it('dials voice calls and queues speak commands', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse(
        calls.length === 1
          ? { data: { call_control_id: 'v3:call-control-id' } }
          : { data: { result: 'ok' } },
      );
    }));

    const result = await bot.send(ctx(), '+15559876543', { voice: { say: 'hello voice' } }, {
      from: '+15551234567',
      connectionId: '1293384261075731499',
      voice: 'Telnyx.KokoroTTS.af',
    });

    expect(result.id).toBe('v3:call-control-id');
    expect(calls.map((call) => call.url)).toEqual([
      'https://api.telnyx.com/v2/calls',
      'https://api.telnyx.com/v2/calls/v3%3Acall-control-id/actions/speak',
    ]);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      connection_id: '1293384261075731499',
      from: '+15551234567',
      to: '+15559876543',
    });
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({
      payload: 'hello voice',
      voice: 'Telnyx.KokoroTTS.af',
    });
  });
});

describe('bot-telnyx webhook behavior', () => {
  it('dispatches inbound SMS commands and sends replies', async () => {
    const realFetch = globalThis.fetch;
    const telnyxCalls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://api.telnyx.com')) {
        telnyxCalls.push({ url, init: init ?? {} });
        return jsonResponse({ data: { id: 'reply-message-id' } });
      }
      return realFetch(url, init);
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
        }));
        return { text: 'pong & safe' };
      },
    }];
    const handle = await bot.register(ctx(), handlers, {
      from: '+15551234567',
      webhookPort: 0,
      validateSignature: false,
    }) as { close(): Promise<void>; port: number };

    try {
      const response = await fetch(`http://127.0.0.1:${handle.port}/telnyx/messaging`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            event_type: 'message.received',
            payload: {
              from: { phone_number: '+15559876543' },
              to: [{ phone_number: '+15551234567' }],
              text: '!ping one two',
            },
          },
        }),
      });
      await expect(seen).resolves.toBe(JSON.stringify({
        type: 'command',
        channel: '+15559876543',
        command: 'ping',
        args: ['one', 'two'],
        user: '+15559876543',
      }));
      expect(response.status).toBe(200);
      expect(JSON.parse(String(telnyxCalls[0]?.init.body))).toEqual({
        from: '+15551234567',
        to: '+15559876543',
        text: 'pong & safe',
      });
    } finally {
      await handle.close();
    }
  });

  it('validates Telnyx Ed25519 webhook signatures when publicKey is configured', async () => {
    const keys = generateKeyPairSync('ed25519');
    const publicKey = Buffer.from(keys.publicKey.export({ format: 'der', type: 'spki' })).toString('base64');
    const handler = vi.fn();
    const handle = await bot.register(ctx(), [{ match: { type: 'message' }, handle: handler }], {
      from: '+15551234567',
      webhookPort: 0,
      publicKey,
    }) as { close(): Promise<void>; port: number };

    try {
      const body = JSON.stringify({
        data: {
          event_type: 'message.received',
          payload: {
            from: { phone_number: '+15559876543' },
            text: 'hello',
          },
        },
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const valid = await fetch(`http://127.0.0.1:${handle.port}/telnyx/messaging`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'telnyx-timestamp': timestamp,
          'telnyx-signature-ed25519': signature(keys.privateKey, timestamp, body),
        },
        body,
      });
      expect(valid.status).toBe(200);
      expect(handler).toHaveBeenCalledOnce();

      const invalid = await fetch(`http://127.0.0.1:${handle.port}/telnyx/messaging`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'telnyx-timestamp': timestamp,
          'telnyx-signature-ed25519': 'bad',
        },
        body,
      });
      expect(invalid.status).toBe(403);
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
      return key === 'TELNYX_API_KEY' ? 'telnyx-api-key' : undefined;
    },
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function signature(privateKey: Parameters<typeof sign>[2], timestamp: string, body: string): string {
  return sign(null, Buffer.from(`${timestamp}|${body}`), privateKey).toString('base64');
}
