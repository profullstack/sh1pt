import { contractTestSocial } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

const samplePost = {
  body: 'Going live with a product walkthrough.',
  link: 'https://example.com/live',
};

contractTestSocial(adapter, {
  sampleConfig: {
    broadcasterId: '12826',
    senderId: '141981764',
    baseUrl: 'https://twitch.test/helix',
  },
  samplePost,
  requiredSecrets: ['TWITCH_ACCESS_TOKEN', 'TWITCH_CLIENT_ID'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-twitch', () => {
  it('connects by reading the configured broadcaster through Helix users', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({
      data: [{ id: '12826', login: 'twitchdev', display_name: 'TwitchDev' }],
    }));

    await expect(adapter.connect(ctx({
      TWITCH_ACCESS_TOKEN: 'mock-twitch-token',
      TWITCH_CLIENT_ID: 'mock-client-id',
    }), {
      broadcasterId: '12826',
      baseUrl: 'https://twitch.test/helix',
    })).resolves.toEqual({ accountId: '12826' });

    expect(fetchMock).toHaveBeenCalledWith('https://twitch.test/helix/users?id=12826', {
      headers: {
        authorization: 'Bearer mock-twitch-token',
        'client-id': 'mock-client-id',
        'content-type': 'application/json',
      },
    });
  });

  it('sends a Twitch chat message through the Helix chat messages endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({
      data: [{ message_id: 'abc-123-def', is_sent: true }],
    }));

    await expect(adapter.post({
      ...ctx({
        TWITCH_ACCESS_TOKEN: 'mock-twitch-token',
        TWITCH_CLIENT_ID: 'mock-client-id',
      }),
      dryRun: false,
    }, samplePost, {
      broadcasterId: '12826',
      senderId: '141981764',
      baseUrl: 'https://twitch.test/helix/',
    })).resolves.toMatchObject({
      id: 'abc-123-def',
      url: 'https://www.twitch.tv/',
      platform: 'twitch',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://twitch.test/helix/chat/messages');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      authorization: 'Bearer mock-twitch-token',
      'client-id': 'mock-client-id',
      'content-type': 'application/json',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      broadcaster_id: '12826',
      sender_id: '141981764',
      message: 'Going live with a product walkthrough.\nhttps://example.com/live',
    });
  });

  it('can use TWITCH_SENDER_ID and include optional reply/shared-chat fields', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({
      data: [{ message_id: 'reply-1', is_sent: true }],
    }));

    await adapter.post({
      ...ctx({
        TWITCH_ACCESS_TOKEN: 'mock-twitch-token',
        TWITCH_CLIENT_ID: 'mock-client-id',
        TWITCH_SENDER_ID: '99999',
      }),
      dryRun: false,
    }, samplePost, {
      broadcasterId: '12826',
      replyParentMessageId: 'parent-1',
      forSourceOnly: false,
      baseUrl: 'https://twitch.test/helix',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      sender_id: '99999',
      reply_parent_message_id: 'parent-1',
      for_source_only: false,
    });
  });

  it('surfaces Twitch drop reasons when a message is not sent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({
      data: [{
        message_id: 'dropped-1',
        is_sent: false,
        drop_reason: { code: 'automod_held', message: 'Message held by AutoMod' },
      }],
    }));

    await expect(adapter.post({
      ...ctx({
        TWITCH_ACCESS_TOKEN: 'mock-twitch-token',
        TWITCH_CLIENT_ID: 'mock-client-id',
      }),
      dryRun: false,
    }, samplePost, {
      broadcasterId: '12826',
      senderId: '141981764',
      baseUrl: 'https://twitch.test/helix',
    })).rejects.toThrow('Message held by AutoMod');
  });

  it('redacts the access token from Twitch API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({
      message: 'Token mock-twitch-token is invalid',
    }, 401, 'Unauthorized'));

    await expect(adapter.post({
      ...ctx({
        TWITCH_ACCESS_TOKEN: 'mock-twitch-token',
        TWITCH_CLIENT_ID: 'mock-client-id',
      }),
      dryRun: false,
    }, samplePost, {
      broadcasterId: '12826',
      senderId: '141981764',
      baseUrl: 'https://twitch.test/helix',
    })).rejects.toThrow('Token [redacted] is invalid');
  });
});

function ctx(secrets: Record<string, string>) {
  return {
    secret(key: string) {
      return secrets[key];
    },
    log: vi.fn(),
  };
}

function jsonResponse(json: unknown, status = 200, statusText = 'OK'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => json,
  } as Response;
}
