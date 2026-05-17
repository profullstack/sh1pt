import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestWebhook, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestWebhook(adapter, {
  sampleConfig: { chatId: -1001234567890 },
  requiredSecrets: ['TELEGRAM_BOT_TOKEN'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('webhook-telegram HTTP delivery', () => {
  const payload = {
    event: 'ship.published',
    timestamp: '2026-05-11T20:00:00.000Z',
    project: 'demo',
    data: { target: 'pkg-npm' },
  };

  it('posts the formatted sendMessage payload to Telegram', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { message_id: 42 } }),
    } as any);

    const ctx = {
      ...fakeConnectContext({ TELEGRAM_BOT_TOKEN: '123:abc' }),
      dryRun: false,
    };

    const result = await adapter.send(ctx as any, payload, { chatId: -1001234567890, parseMode: 'HTML' });

    expect(result).toEqual({ ok: true, status: 200, url: 'https://api.telegram.org/bot123:abc/sendMessage' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.telegram.org/bot123:abc/sendMessage');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ 'content-type': 'application/json' });
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.chat_id).toBe(-1001234567890);
    expect(body.parse_mode).toBe('HTML');
    expect(body.text).toContain('ship\\.published');
  });

  it('returns Telegram error descriptions when sendMessage is rejected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ ok: false, description: 'Bad Request: chat not found' }),
    } as any);

    const ctx = {
      ...fakeConnectContext({ TELEGRAM_BOT_TOKEN: '123:abc' }),
      dryRun: false,
    };

    await expect(adapter.send(ctx as any, payload, { chatId: -1001234567890 })).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'Bad Request: chat not found',
      url: 'https://api.telegram.org/bot123:abc/sendMessage',
    });
  });
});
