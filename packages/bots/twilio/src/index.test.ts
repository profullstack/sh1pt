import { contractTestBot } from '@profullstack/sh1pt-core/testing';
import type { BotHandler } from '@profullstack/sh1pt-core';
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import bot from './index.js';

contractTestBot(bot, { sampleConfig: { accountSid: 'AC_test', from: '+15551234567' }, sampleChannel: '+15559876543' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bot-twilio REST behavior', () => {
  it('sends SMS messages through the Messages resource', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse({ sid: 'SMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', status: 'queued' });
    }));

    const result = await bot.send(ctx(), '+15559876543', { text: 'hello sms' }, {
      accountSid: 'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      from: '+15551234567',
    });

    expect(result.id).toBe('SMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const call = calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error('missing Twilio SMS call');
    expect(call.url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Messages.json');
    expect(call.init.method).toBe('POST');
    expect((call.init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:twilio-auth-token').toString('base64')}`);
    expect(Object.fromEntries(new URLSearchParams(String(call.init.body)))).toEqual({
      To: '+15559876543',
      Body: 'hello sms',
      From: '+15551234567',
    });
  });

  it('sends voice calls through the Calls resource with TwiML', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse({ sid: 'CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', status: 'queued' });
    }));

    const result = await bot.send(ctx(), '+15559876543', { voice: { say: 'hello voice' } }, {
      accountSid: 'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      from: '+15551234567',
    });

    expect(result.id).toBe('CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const body = Object.fromEntries(new URLSearchParams(String(calls[0]?.init.body)));
    expect(calls[0]?.url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls.json');
    expect(body).toEqual({
      To: '+15559876543',
      From: '+15551234567',
      Twiml: '<Response><Say>hello voice</Say></Response>',
    });
  });
});

describe('bot-twilio webhook behavior', () => {
  it('dispatches inbound SMS commands and returns TwiML replies', async () => {
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
      accountSid: 'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      from: '+15551234567',
      webhookPort: 0,
      validateSignature: false,
    }) as { close(): Promise<void>; port: number };

    try {
      const response = await fetch(`http://127.0.0.1:${handle.port}/twilio/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          From: '+15559876543',
          To: '+15551234567',
          Body: '!ping one two',
          MessageSid: 'SMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        }),
      });
      await expect(seen).resolves.toBe(JSON.stringify({
        type: 'command',
        channel: '+15559876543',
        command: 'ping',
        args: ['one', 'two'],
        user: '+15559876543',
      }));
      expect(await response.text()).toBe('<Response><Message>pong &amp; safe</Message></Response>');
    } finally {
      await handle.close();
    }
  });

  it('validates Twilio webhook signatures when webhookBaseUrl is configured', async () => {
    const handler = vi.fn(() => ({ text: 'ok' }));
    const handle = await bot.register(ctx(), [{ match: { type: 'message' }, handle: handler }], {
      accountSid: 'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      from: '+15551234567',
      webhookPort: 0,
      webhookBaseUrl: 'https://public.example',
    }) as { close(): Promise<void>; port: number };

    try {
      const params = new URLSearchParams({
        From: '+15559876543',
        To: '+15551234567',
        Body: 'hello',
      });
      const valid = await fetch(`http://127.0.0.1:${handle.port}/twilio/sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Twilio-Signature': signature('https://public.example/twilio/sms', params),
        },
        body: params,
      });
      expect(valid.status).toBe(200);
      expect(handler).toHaveBeenCalledOnce();

      const invalid = await fetch(`http://127.0.0.1:${handle.port}/twilio/sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Twilio-Signature': 'bad',
        },
        body: params,
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
      return key === 'TWILIO_AUTH_TOKEN' ? 'twilio-auth-token' : undefined;
    },
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}

function signature(url: string, params: URLSearchParams): string {
  const payload = [...params.entries()]
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .reduce((acc, [key, value]) => acc + key + value, url);
  return createHmac('sha1', 'twilio-auth-token').update(payload).digest('base64');
}
