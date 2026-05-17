import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: { chatId: '@sh1pt' },
  samplePost: { body: 'hello from sh1pt contract tests' },
  requiredSecrets: ['TELEGRAM_BOT_TOKEN'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-telegram posting', () => {
  it('posts text with sendMessage and returns the Telegram message link', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: { message_id: 42, chat: { username: 'sh1pt' }, date: 1_779_000_000 },
      }),
    } as any);

    const ctx = {
      ...fakeConnectContext({ TELEGRAM_BOT_TOKEN: '123:abc' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, { body: 'Release shipped', link: 'https://sh1pt.com' }, { chatId: '@sh1pt' });

    expect(result).toEqual({
      id: '42',
      url: 'https://t.me/sh1pt/42',
      platform: 'telegram',
      publishedAt: '2026-05-17T06:40:00.000Z',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.telegram.org/bot123:abc/sendMessage');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ 'content-type': 'application/json' });
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({
      chat_id: '@sh1pt',
      text: 'Release shipped\nhttps://sh1pt.com',
    });
  });

  it('throws Telegram error descriptions when sendMessage is rejected', async () => {
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

    await expect(adapter.post(ctx as any, { body: 'Release shipped' }, { chatId: '@missing' }))
      .rejects.toThrow('Bad Request: chat not found');
  });
});
