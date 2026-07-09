import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestWebhook, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestWebhook(adapter, {
  sampleConfig: {},
  requiredSecrets: ['SLACK_WEBHOOK_URL'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('webhook-slack HTTP delivery', () => {
  const payload = {
    event: 'ship.published',
    timestamp: '2026-05-11T20:00:00.000Z',
    project: 'demo',
    data: { target: 'pkg-npm' },
  };

  it('posts the formatted Block Kit payload to Slack', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'ok',
    } as any);

    const ctx = {
      ...fakeConnectContext({ SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T/B/C' }),
      dryRun: false,
    };

    const result = await adapter.send(ctx as any, payload, { username: 'shipbot' });

    expect(result).toEqual({ ok: true, status: 200, url: 'https://hooks.slack.com/services/T/B/C' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://hooks.slack.com/services/T/B/C');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.username).toBe('shipbot');
    expect(body.text).toBe('*ship.published*');
    expect(body.blocks[0]).toMatchObject({ type: 'section' });
  });

  it('returns Slack error text when the webhook rejects the payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'invalid_payload',
    } as any);

    const ctx = {
      ...fakeConnectContext({ SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T/B/C' }),
      dryRun: false,
    };

    await expect(adapter.send(ctx as any, payload, {})).resolves.toEqual({
      ok: false,
      status: 200,
      error: 'invalid_payload',
      url: 'https://hooks.slack.com/services/T/B/C',
    });
  });
});
