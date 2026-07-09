import { contractTestBridge } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter, {
  mapMastodonStatus,
  mastodonStatusPayload,
  normalizeMastodonChannel,
  parseMastodonSseEvent,
} from './index.js';

contractTestBridge(adapter, {
  sampleConfig: { instance: 'mastodon.test', apiBase: 'https://mastodon.test' },
  sampleChannel: 'sh1pt',
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mastodon bridge payloads', () => {
  it('renders bridged identity, attachment links, and a hashtag channel', () => {
    const payload = mastodonStatusPayload({
      id: 'src-1',
      channel: 'discord:123',
      identity: { network: 'discord', username: 'Ada' },
      text: 'ship it',
      attachments: [{ url: 'https://example.com/proof.png', kind: 'image', filename: 'proof.png' }],
      timestamp: '2026-05-21T12:00:00.000Z',
    }, '#fediverse', { maxChars: 500 });

    expect(payload).toBe('Ada [discord]: ship it\nproof.png: https://example.com/proof.png\n#fediverse');
  });

  it('does not duplicate an existing hashtag and applies max length', () => {
    const payload = mastodonStatusPayload({
      id: 'src-1',
      channel: 'src',
      identity: { network: 'irc', username: 'Casey' },
      text: 'hello #ops'.padEnd(80, 'x'),
      timestamp: '2026-05-21T12:00:00.000Z',
    }, 'ops', { maxChars: 40 });

    expect(payload).toHaveLength(40);
    expect(payload.endsWith('...')).toBe(true);
    expect(payload.match(/#ops/g)).toHaveLength(1);
  });

  it('normalizes hashtag channels for streams', () => {
    expect(normalizeMastodonChannel('#builds')).toBe('builds');
    expect(normalizeMastodonChannel('tag:launch')).toBe('launch');
  });
});

describe('mastodon status mapping', () => {
  it('maps Mastodon status JSON into BridgeMessage values', () => {
    const msg = mapMastodonStatus({
      id: '109',
      created_at: '2026-05-21T12:00:00.000Z',
      content: '<p>Hello &amp; welcome <a href="https://mastodon.test/tags/test">#<span>test</span></a></p>',
      spoiler_text: 'Launch &lt;soon&gt;',
      in_reply_to_id: '108',
      account: {
        username: 'ada',
        acct: 'ada@mastodon.test',
        display_name: 'Ada',
        avatar_static: 'https://mastodon.test/avatar.png',
        bot: false,
      },
      media_attachments: [
        {
          type: 'image',
          url: 'https://mastodon.test/media/image.png',
          description: 'diagram.png',
          mime_type: 'image/png',
        },
      ],
    }, 'test');

    expect(msg).toEqual({
      id: '109',
      channel: 'test',
      identity: {
        network: 'mastodon',
        username: 'Ada',
        avatarUrl: 'https://mastodon.test/avatar.png',
        isBot: false,
      },
      text: 'CW: Launch <soon>\nHello & welcome #test',
      replyToId: '108',
      attachments: [
        {
          url: 'https://mastodon.test/media/image.png',
          kind: 'image',
          filename: 'diagram.png',
          mimeType: 'image/png',
        },
      ],
      timestamp: '2026-05-21T12:00:00.000Z',
      originalNetwork: 'mastodon',
    });
  });

  it('drops statuses without an id', () => {
    expect(mapMastodonStatus({ content: '<p>missing id</p>' }, 'test')).toBeUndefined();
  });
});

describe('mastodon SSE parsing', () => {
  it('parses update events with multiline data', () => {
    expect(parseMastodonSseEvent('id: 7\nevent: update\ndata: {"id":"1",\ndata: "content":"ok"}')).toEqual({
      id: '7',
      event: 'update',
      data: '{"id":"1",\n"content":"ok"}',
    });
  });

  it('ignores comment-only events', () => {
    expect(parseMastodonSseEvent(': heartbeat')).toBeUndefined();
  });
});

describe('mastodon bridge send', () => {
  it('posts statuses to the configured instance', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ id: 'mastodon-status-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await adapter.send({
      secret: (key: string) => key === 'MASTODON_TOKEN_MASTODON_TEST' ? 'bridge-token' : undefined,
      log: () => {},
      dryRun: false,
    }, 'sh1pt', {
      id: 'src-1',
      channel: 'matrix:room',
      identity: { network: 'matrix', username: 'Casey' },
      text: 'hello',
      timestamp: '2026-05-21T12:00:00.000Z',
    }, { instance: 'https://mastodon.test', apiBase: 'https://mastodon.test' });

    expect(res).toEqual({ id: 'mastodon-status-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://mastodon.test/api/v1/statuses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer bridge-token',
          'Content-Type': 'application/json',
          'Idempotency-Key': expect.stringMatching(/^sh1pt-[a-f0-9]+$/),
        }),
      }),
    );
    const [, requestInit] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(requestInit.body))).toEqual({
      status: 'Casey [matrix]: hello\n#sh1pt',
      visibility: 'public',
    });
  });

  it('redacts provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => JSON.stringify({ error: 'bad token bridge-token' }),
    }));

    await expect(adapter.send({
      secret: (key: string) => key === 'MASTODON_BRIDGE_ACCESS_TOKEN' ? 'bridge-token' : undefined,
      log: () => {},
      dryRun: false,
    }, 'sh1pt', {
      id: 'src-1',
      channel: 'matrix:room',
      identity: { network: 'matrix', username: 'Casey' },
      text: 'hello',
      timestamp: '2026-05-21T12:00:00.000Z',
    }, { instance: 'mastodon.test', apiBase: 'https://mastodon.test' })).rejects.toThrow('bad token [redacted]');
  });
});

describe('mastodon bridge subscribe', () => {
  it('opens hashtag streams without waiting for the stream to finish', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: () => new Promise(() => {}),
        }),
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await Promise.race([
      adapter.subscribe({
        secret: (key: string) => key === 'MASTODON_TOKEN_MASTODON_TEST' ? 'bridge-token' : undefined,
        log: () => {},
      }, ['#builds'], () => {}, { instance: 'mastodon.test', apiBase: 'https://mastodon.test' }),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 25)),
    ]);

    expect(result).not.toBe('timeout');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://mastodon.test/api/v1/streaming/hashtag?tag=builds',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'text/event-stream',
          Authorization: 'Bearer bridge-token',
        }),
      }),
    );
  });
});
