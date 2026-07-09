import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestWebhook, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import webhook from './index.js';

contractTestWebhook(webhook, {
  sampleConfig: {},
  requiredSecrets: ['DISCORD_WEBHOOK_URL'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('webhook-discord HTTP delivery', () => {
  const payload = {
    event: 'ship.published',
    timestamp: '2026-05-11T20:00:00.000Z',
    project: 'demo',
    data: { target: 'pkg-npm' },
  };

  it('posts the formatted message payload to Discord', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => '',
    } as any);

    const ctx = {
      ...fakeConnectContext({ DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/token' }),
      dryRun: false,
    };

    const result = await webhook.send(ctx as any, payload, { username: 'shipbot', mention: '<@&123>' });

    expect(result).toEqual({ ok: true, status: 204, url: 'https://discord.com/api/webhooks/1/token' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://discord.com/api/webhooks/1/token');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ 'content-type': 'application/json' });
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.username).toBe('shipbot');
    expect(body.content).toContain('<@&123>');
    expect(body.embeds[0]).toMatchObject({ title: 'ship.published', color: 0x22c55e });
  });

  it('returns Discord error messages when delivery fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => JSON.stringify({ message: 'You are being rate limited.', retry_after: 0.25 }),
    } as any);

    const ctx = {
      ...fakeConnectContext({ DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/token' }),
      dryRun: false,
    };

    await expect(webhook.send(ctx as any, payload, {})).resolves.toEqual({
      ok: false,
      status: 429,
      error: 'You are being rate limited.',
      url: 'https://discord.com/api/webhooks/1/token',
    });
  });
});
