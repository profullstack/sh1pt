import { contractTestBot } from '@profullstack/sh1pt-core/testing';
import { request, type Server } from 'node:http';
import { describe, expect, it } from 'vitest';
import bot, { slackSignature, type FetchLike } from './index.js';
import type { BotCtx, BotEvent, BotHandler } from '@profullstack/sh1pt-core';

contractTestBot(bot, { sampleConfig: {}, sampleChannel: 'C0123456789' });

function ctx(): BotCtx {
  return {
    secret(key) {
      if (key === 'SLACK_BOT_TOKEN') return 'token';
      if (key === 'SLACK_SIGNING_SECRET') return 'synthetic-signing-key';
      return undefined;
    },
    log() {},
    dryRun: false,
  };
}

function captureFetch(responses: Array<{ ok: boolean; ts?: string; error?: string }> = [{ ok: true, ts: '1700000000.000100' }]) {
  const calls: Array<{ url: string; init: Parameters<FetchLike>[1] }> = [];
  const fetcher: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return {
      async json() {
        return responses.shift() ?? { ok: true, ts: '1700000000.000200' };
      },
    };
  };
  return { calls, fetcher };
}

function signHeaders(body: string, signingKey = 'synthetic-signing-key'): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    'x-slack-request-timestamp': timestamp,
    'x-slack-signature': slackSignature(body, timestamp, signingKey),
  };
}

async function post(port: number, path: string, body: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return await new Promise((resolve, reject) => {
    const req = request(
      {
        method: 'POST',
        host: '127.0.0.1',
        port,
        path,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

function serverPort(server: Server): number {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a TCP port');
  return address.port;
}

describe('Slack bot adapter', () => {
  it('posts proactive messages with Slack Web API JSON and bearer auth', async () => {
    const { calls, fetcher } = captureFetch([{ ok: true, ts: '1700000000.123456' }]);

    const result = await bot.send(
      ctx(),
      'C0123456789',
      { text: 'hello', actions: [{ id: 'open', label: 'Open', style: 'primary', url: 'https://example.test' }] },
      { fetch: fetcher },
    );

    expect(result.id).toBe('1700000000.123456');
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error('expected Slack Web API call');
    expect(call.url).toBe('https://slack.com/api/chat.postMessage');
    expect(call.init.headers.Authorization).toBe('Bearer token');
    expect(JSON.parse(call.init.body)).toMatchObject({
      channel: 'C0123456789',
      text: 'hello',
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: 'hello' } },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              action_id: 'open',
              text: { type: 'plain_text', text: 'Open' },
              style: 'primary',
              url: 'https://example.test',
              value: 'https://example.test',
            },
          ],
        },
      ],
    });
  });

  it('accepts URL verification challenges after validating the Slack signature', async () => {
    const { fetcher } = captureFetch();
    let server: Server | undefined;
    const closeable = await bot.register(
      ctx(),
      [],
      { port: 0, fetch: fetcher, onServerReady: (value) => { server = value; } },
    );
    const body = JSON.stringify({ type: 'url_verification', challenge: 'challenge-token' });

    const response = await post(serverPort(server!), '/slack/events', body, signHeaders(body));

    expect(response).toEqual({ status: 200, body: 'challenge-token' });
    await closeable.close();
  });

  it('dispatches Events API messages as commands and replies in the thread', async () => {
    const seen: BotEvent[] = [];
    const { calls, fetcher } = captureFetch([{ ok: true, ts: '1700000001.000100' }]);
    let server: Server | undefined;
    const handler: BotHandler = {
      match: { type: 'command', command: 'ping' },
      handle(_ctx, event) {
        seen.push(event);
        return { text: `pong ${event.args?.join(' ')}` };
      },
    };
    const closeable = await bot.register(
      ctx(),
      [handler],
      { port: 0, fetch: fetcher, onServerReady: (value) => { server = value; } },
    );
    const body = JSON.stringify({
      type: 'event_callback',
      event_id: 'Ev123',
      event: {
        type: 'message',
        channel: 'C123',
        user: 'U123',
        text: '!ping alpha beta',
        ts: '1700000000.000200',
        event_ts: '1700000000.000300',
      },
    });

    const response = await post(serverPort(server!), '/slack/events', body, signHeaders(body));

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: true });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      type: 'command',
      channel: 'C123',
      user: { id: 'U123' },
      text: '!ping alpha beta',
      command: 'ping',
      args: ['alpha', 'beta'],
      replyToId: '1700000000.000200',
      timestamp: '2023-11-14T22:13:20.000Z',
    });
    const replyCall = calls[0];
    if (!replyCall) throw new Error('expected Slack reply API call');
    expect(JSON.parse(replyCall.init.body)).toMatchObject({
      channel: 'C123',
      text: 'pong alpha beta',
      thread_ts: '1700000000.000200',
    });
    await closeable.close();
  });

  it('rejects Slack Events API requests with invalid signatures', async () => {
    const { fetcher } = captureFetch();
    let server: Server | undefined;
    const closeable = await bot.register(
      ctx(),
      [],
      { port: 0, fetch: fetcher, onServerReady: (value) => { server = value; } },
    );
    const body = JSON.stringify({ type: 'event_callback', event: { type: 'message', channel: 'C123' } });

    const response = await post(serverPort(server!), '/slack/events', body, {
      'x-slack-request-timestamp': String(Math.floor(Date.now() / 1000)),
      'x-slack-signature': 'v0=bad',
    });

    expect(response.status).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ ok: false, error: 'invalid_signature' });
    await closeable.close();
  });

  it('dispatches signed block action payloads as interactions', async () => {
    const seen: BotEvent[] = [];
    const { calls, fetcher } = captureFetch([{ ok: true, ts: '1700000002.000100' }]);
    let server: Server | undefined;
    const handler: BotHandler = {
      match: { type: 'interaction', actionId: 'approve' },
      handle(_ctx, event) {
        seen.push(event);
        return { text: 'approved' };
      },
    };
    const closeable = await bot.register(
      ctx(),
      [handler],
      { port: 0, fetch: fetcher, onServerReady: (value) => { server = value; } },
    );
    const payload = JSON.stringify({
      type: 'block_actions',
      user: { id: 'U123', username: 'viewer' },
      channel: { id: 'C123' },
      container: { message_ts: '1700000002.000200' },
      actions: [{ action_id: 'approve', value: 'yes' }],
    });
    const body = new URLSearchParams({ payload }).toString();
    const headers = {
      ...signHeaders(body),
      'content-type': 'application/x-www-form-urlencoded',
    };

    const response = await post(serverPort(server!), '/slack/events', body, headers);

    expect(response.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      type: 'interaction',
      channel: 'C123',
      user: { id: 'U123', displayName: 'viewer' },
      text: 'yes',
      command: 'approve',
      replyToId: '1700000002.000200',
    });
    expect(JSON.parse(calls[0]!.init.body)).toMatchObject({
      channel: 'C123',
      text: 'approved',
      thread_ts: '1700000002.000200',
    });
    await closeable.close();
  });
});
