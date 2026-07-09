import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestBridge } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestBridge(adapter, {
  sampleConfig: {},
  sampleChannel: '-1001234567890',
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('bridge-telegram Bot API integration', () => {
  it('sends relayed messages through sendMessage', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { message_id: 42 } }),
    } as any);

    const result = await adapter.send(ctx({ TELEGRAM_BRIDGE_BOT_TOKEN: '123:abc' }), '-1001234567890', {
      id: 'src-1',
      channel: 'discord-1',
      identity: { network: 'discord', username: 'alice' },
      text: 'release shipped',
      attachments: [{ kind: 'file', url: 'https://example.com/log.txt', filename: 'log.txt' }],
      timestamp: '2026-05-21T00:00:00.000Z',
      originalNetwork: 'discord',
    }, {
      baseUrl: 'https://telegram.test',
      parseMode: 'HTML',
      disableNotification: true,
    });

    expect(result).toEqual({ id: '42' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://telegram.test/bot123:abc/sendMessage');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'content-type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({
      chat_id: '-1001234567890',
      text: '<b>alice [discord]</b>: release shipped\nfile: https://example.com/log.txt',
      parse_mode: 'HTML',
      disable_notification: true,
    });
  });

  it('surfaces Telegram sendMessage errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ ok: false, description: 'Bad Request: chat not found' }),
    } as any);

    await expect(adapter.send(ctx({ TELEGRAM_BRIDGE_BOT_TOKEN: '123:abc' }), '-100missing', {
      id: 'src-1',
      channel: 'src',
      identity: { network: 'slack', username: 'bob' },
      text: 'hello',
      timestamp: '2026-05-21T00:00:00.000Z',
    }, { baseUrl: 'https://telegram.test' })).rejects.toThrow('Bad Request: chat not found');
  });

  it('long-polls updates and maps Telegram messages into bridge messages', async () => {
    const abort = new AbortController();
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: [{
            update_id: 100,
            message: {
              message_id: 7,
              date: 1_779_321_600,
              chat: { id: -1001234567890, type: 'supergroup', title: 'Launch Room' },
              from: { id: 5, is_bot: false, first_name: 'Ada', last_name: 'Lovelace', username: 'ada' },
              text: 'ship it',
              photo: [{ file_id: 'small' }, { file_id: 'large' }],
            },
          }],
        }),
      } as any)
      .mockImplementationOnce(async () => {
        abort.abort();
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, result: [] }),
        } as any;
      });

    const onMessage = vi.fn();
    const subscription = await adapter.subscribe({
      secret: (key: string) => ({ TELEGRAM_BRIDGE_BOT_TOKEN: '123:abc' })[key],
      log: vi.fn(),
      signal: abort.signal,
    }, ['-1001234567890'], onMessage, {
      baseUrl: 'https://telegram.test',
      pollTimeoutSeconds: 1,
      pollLimit: 10,
    });

    await vi.waitFor(() => expect(onMessage).toHaveBeenCalledTimes(1));
    await subscription.close();

    expect(fetchMock).toHaveBeenCalled();
    const firstUrl = fetchMock.mock.calls[0]?.[0] as URL;
    expect(String(firstUrl)).toContain('https://telegram.test/bot123:abc/getUpdates');
    expect(firstUrl.searchParams.get('timeout')).toBe('1');
    expect(firstUrl.searchParams.get('limit')).toBe('10');
    expect(onMessage).toHaveBeenCalledWith({
      id: '7',
      channel: '-1001234567890',
      identity: { network: 'telegram', username: 'ada', isBot: false },
      text: 'ship it',
      attachments: [{ url: 'telegram:file/large', kind: 'image' }],
      timestamp: '2026-05-21T00:00:00.000Z',
      originalNetwork: 'telegram',
    });
  });
});

function ctx(secrets: Record<string, string>) {
  return {
    secret(key: string) {
      return secrets[key];
    },
    log: vi.fn(),
    dryRun: false,
  };
}
