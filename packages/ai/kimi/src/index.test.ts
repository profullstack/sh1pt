import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (secrets: Record<string, string> = { MOONSHOT_API_KEY: 'test-key' }, dryRun = false) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Kimi OpenAI-compatible generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx({ MOONSHOT_API_KEY: 'test-key' }, true), 'hello', {}, {});

    expect(result).toEqual({ text: '[dry-run]', model: 'kimi-k2.6' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi from kimi' } }],
        model: 'kimi-k2-thinking',
        usage: { prompt_tokens: 9, completion_tokens: 4 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx(), 'hello', {
      model: 'kimi-k2-thinking',
      system: 'be brief',
      maxTokens: 24,
      temperature: 0.2,
      extra: { top_p: 0.95 },
    }, {});

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.moonshot.ai/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(request.body)).toEqual({
      model: 'kimi-k2-thinking',
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 24,
      temperature: 0.2,
      top_p: 0.95,
    });
    expect(result).toEqual({
      text: 'hi from kimi',
      model: 'kimi-k2-thinking',
      inputTokens: 9,
      outputTokens: 4,
    });
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid key'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(/Kimi 401: invalid key/);
  });
});
