import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestWebhook, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestWebhook(adapter, {
  sampleConfig: {},
  requiredSecrets: ['WEBHOOK_URL'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('webhook-generic HTTP delivery', () => {
  const payload = {
    event: 'ship.published',
    timestamp: '2026-05-11T20:00:00.000Z',
    data: { target: 'pkg-npm' },
  };

  it('posts JSON with event and HMAC signature headers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 202,
      text: async () => 'accepted',
    } as any);

    const ctx = {
      ...fakeConnectContext({
        WEBHOOK_URL: 'https://example.com/hook',
        WEBHOOK_SECRET: 'secret',
      }),
      dryRun: false,
    };

    const result = await adapter.send(ctx as any, payload, {
      extraHeaders: { 'X-Custom': 'demo' },
    });

    expect(result).toEqual({ ok: true, status: 202, url: 'https://example.com/hook' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://example.com/hook');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBe(JSON.stringify(payload));
    expect((init as RequestInit).headers).toMatchObject({
      'content-type': 'application/json',
      'X-Sh1pt-Event': 'ship.published',
      'X-Sh1pt-Signature': 'sha256=688ccc580a285a37b0bbd66d9b78c43fa13fd4a4cde5e72cff6b01cb92ef6a7d',
      'X-Custom': 'demo',
    });
  });

  it('returns non-2xx status and response body on delivery failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'receiver failed',
    } as any);

    const ctx = {
      ...fakeConnectContext({ WEBHOOK_URL: 'https://example.com/hook' }),
      dryRun: false,
    };

    await expect(adapter.send(ctx as any, payload, {})).resolves.toEqual({
      ok: false,
      status: 500,
      error: 'receiver failed',
      url: 'https://example.com/hook',
    });
  });
});
