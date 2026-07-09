import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestWebhook, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestWebhook(adapter, {
  sampleConfig: {},
  requiredSecrets: ['TEAMS_WEBHOOK_URL'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('webhook-teams HTTP delivery', () => {
  const payload = {
    event: 'ship.published',
    timestamp: '2026-05-11T20:00:00.000Z',
    data: { target: 'pkg-npm' },
  };

  it('posts the formatted Adaptive Card payload to Teams', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '1',
    } as any);

    const ctx = {
      ...fakeConnectContext({ TEAMS_WEBHOOK_URL: 'https://example.com/teams' }),
      dryRun: false,
    };

    const result = await adapter.send(ctx as any, payload, {});

    expect(result).toEqual({ ok: true, status: 200, url: 'https://example.com/teams' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://example.com/teams');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      type: 'message',
      attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive' }],
    });
  });

  it('returns non-2xx status and response body on delivery failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 410,
      statusText: 'Gone',
      text: async () => 'webhook has been removed',
    } as any);

    const ctx = {
      ...fakeConnectContext({ TEAMS_WEBHOOK_URL: 'https://example.com/teams' }),
      dryRun: false,
    };

    await expect(adapter.send(ctx as any, payload, {})).resolves.toEqual({
      ok: false,
      status: 410,
      error: 'webhook has been removed',
      url: 'https://example.com/teams',
    });
  });
});
