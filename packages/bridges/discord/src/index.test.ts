import { contractTestBridge } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import bridge, { discordIdentifyPayload, discordMessagePayload, mapDiscordMessage } from './index.js';

contractTestBridge(bridge, {
  sampleConfig: {},
  sampleChannel: '123456789012',
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('discord bridge payloads', () => {
  it('renders bridged identity and disables mention parsing', () => {
    const payload = discordMessagePayload({
      id: 'src-1',
      channel: 'slack:C1',
      identity: { network: 'slack', username: 'Ada', avatarUrl: 'https://example.com/avatar.png' },
      text: 'ship it @everyone',
      attachments: [{ url: 'https://example.com/log.txt', kind: 'file', filename: 'log.txt' }],
      timestamp: '2026-05-21T12:00:00.000Z',
    });

    expect(payload).toMatchObject({
      allowed_mentions: { parse: [] },
      embeds: [
        {
          author: { name: 'Ada [slack]', icon_url: 'https://example.com/avatar.png' },
          timestamp: '2026-05-21T12:00:00.000Z',
        },
      ],
    });
    expect(payload.content).toContain('Ada [slack]: ship it @ everyone');
    expect(payload.content).toContain('log.txt: https://example.com/log.txt');
  });

  it('maps Discord MESSAGE_CREATE payloads into BridgeMessage values', () => {
    const msg = mapDiscordMessage({
      id: 'm1',
      channel_id: '123456789012',
      content: 'hello',
      timestamp: '2026-05-21T12:00:00.000Z',
      author: {
        id: 'u1',
        username: 'discord-user',
        global_name: 'Discord User',
        avatar: 'a_hash',
        bot: false,
      },
      member: { nick: 'Nick' },
      attachments: [
        { url: 'https://cdn.example.com/image.png', filename: 'image.png', content_type: 'image/png' },
      ],
      message_reference: { message_id: 'parent-1' },
    }, new Set(['123456789012']));

    expect(msg).toEqual({
      id: 'm1',
      channel: '123456789012',
      identity: {
        network: 'discord',
        username: 'Nick',
        avatarUrl: 'https://cdn.discordapp.com/avatars/u1/a_hash.gif',
        isBot: false,
      },
      text: 'hello',
      replyToId: 'parent-1',
      attachments: [
        {
          url: 'https://cdn.example.com/image.png',
          kind: 'image',
          filename: 'image.png',
          mimeType: 'image/png',
        },
      ],
      timestamp: '2026-05-21T12:00:00.000Z',
      originalNetwork: 'discord',
    });
  });

  it('drops gateway messages outside subscribed channels', () => {
    const msg = mapDiscordMessage({
      id: 'm1',
      channel_id: 'unsubscribed',
      content: 'hello',
    }, new Set(['123456789012']));

    expect(msg).toBeUndefined();
  });

  it('builds Gateway identify packets with requested intents', () => {
    expect(discordIdentifyPayload('secret-token', 512)).toEqual({
      op: 2,
      d: {
        token: 'secret-token',
        intents: 512,
        properties: {
          os: 'sh1pt',
          browser: 'sh1pt',
          device: 'sh1pt',
        },
      },
    });
  });
});

describe('discord bridge send', () => {
  it('posts to the Discord create-message endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ id: 'discord-message-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await bridge.send({
      secret: (key: string) => key === 'DISCORD_BRIDGE_BOT_TOKEN' ? 'bridge-token' : undefined,
      log: () => {},
      dryRun: false,
    }, '123456789012', {
      id: 'src-1',
      channel: 'matrix:room',
      identity: { network: 'matrix', username: 'Casey' },
      text: 'hello',
      timestamp: '2026-05-21T12:00:00.000Z',
    }, { apiBase: 'https://discord.test/api/v10' });

    expect(res).toEqual({ id: 'discord-message-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://discord.test/api/v10/channels/123456789012/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bot bridge-token',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const [, requestInit] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      content: 'Casey [matrix]: hello',
      allowed_mentions: { parse: [] },
    });
  });

  it('redacts the bot token from provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => JSON.stringify({ message: 'bad token bridge-token' }),
    }));

    await expect(bridge.send({
      secret: (key: string) => key === 'DISCORD_BOT_TOKEN' ? 'bridge-token' : undefined,
      log: () => {},
      dryRun: false,
    }, '123456789012', {
      id: 'src-1',
      channel: 'matrix:room',
      identity: { network: 'matrix', username: 'Casey' },
      text: 'hello',
      timestamp: '2026-05-21T12:00:00.000Z',
    }, { apiBase: 'https://discord.test/api/v10' })).rejects.toThrow('bad token [redacted]');
  });
});
