import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestSocial, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestSocial(adapter, {
  sampleConfig: {},
  samplePost: { body: 'hello from sh1pt contract tests' },
  requiredSecrets: ['DISCORD_WEBHOOK_URL'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-discord posting', () => {
  it('posts content through a Discord webhook and returns the message link', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: '123456789',
        channel_id: '222',
        guild_id: '111',
        timestamp: '2026-05-11T20:00:00.000000+00:00',
      }),
    } as any);

    const ctx = {
      ...fakeConnectContext({ DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/token' }),
      dryRun: false,
    };

    const result = await adapter.post(ctx as any, { body: 'Release shipped', link: 'https://sh1pt.com' }, {});

    expect(result).toEqual({
      id: '123456789',
      url: 'https://discord.com/channels/111/222/123456789',
      platform: 'discord',
      publishedAt: '2026-05-11T20:00:00.000Z',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://discord.com/api/webhooks/1/token?wait=true');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ 'content-type': 'application/json' });
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      content: 'Release shipped\nhttps://sh1pt.com',
    });
  });

  it('throws Discord error messages when webhook posting fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => JSON.stringify({ message: 'Invalid Form Body' }),
    } as any);

    const ctx = {
      ...fakeConnectContext({ DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/token' }),
      dryRun: false,
    };

    await expect(adapter.post(ctx as any, { body: 'Release shipped' }, {}))
      .rejects.toThrow('Invalid Form Body');
  });
});
