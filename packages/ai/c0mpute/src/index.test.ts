import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (secrets: Record<string, string> = { C0MPUTE_API_KEY: 'ik_live_test' }, dryRun = false) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('c0mpute generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await adapter.generate(ctx(undefined, true), 'hello', {}, {});
    expect(result).toEqual({ text: '[dry-run]', model: 'huihui_ai/qwen3.5-abliterated:9b' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to Infernet, peers only', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hi' } }], model: 'huihui_ai/qwen3.5-abliterated:9b' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx(), 'hello', { system: 'be brief', maxTokens: 20 }, {});

    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://infernetprotocol.com/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer ik_live_test');
    expect(JSON.parse(request.body)).toEqual({
      model: 'huihui_ai/qwen3.5-abliterated:9b',
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hello' },
      ],
      p2p_only: true,
      max_tokens: 20,
    });
    expect(result.text).toBe('hi');
  });

  it('requires a key and never repeats it in an error', async () => {
    await expect(adapter.generate(ctx({}), 'hello', {}, {})).rejects.toThrow('C0MPUTE_API_KEY not in vault');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'bad ik_live_test' }));
    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow('c0mpute 503: bad [redacted]');
  });
});
