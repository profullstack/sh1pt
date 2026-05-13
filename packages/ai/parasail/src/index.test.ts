import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { PARASAIL_API_KEY: 'test-key' },
  dryRun = false
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Parasail chat completions generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ PARASAIL_API_KEY: 'test-key' }, true),
      'hello',
      {},
      {}
    );

    expect(result).toEqual({ text: '[dry-run]', model: 'parasail-llama-33-70b-fp8' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi from parasail' } }],
        model: 'parasail-qwen3-32b',
        usage: { prompt_tokens: 18, completion_tokens: 7 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        model: 'parasail-qwen3-32b',
        system: 'be concise',
        maxTokens: 64,
        temperature: 0.2,
        extra: { top_p: 0.9 },
      },
      {}
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.parasail.io/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(request.body)).toEqual({
      model: 'parasail-qwen3-32b',
      messages: [
        { role: 'system', content: 'be concise' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 64,
      temperature: 0.2,
      top_p: 0.9,
    });
    expect(result).toEqual({
      text: 'hi from parasail',
      model: 'parasail-qwen3-32b',
      inputTokens: 18,
      outputTokens: 7,
    });
  });

  it('uses a configured base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
        model: 'custom-model',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await adapter.generate(ctx(), 'hello', { model: 'custom-model' }, {
      baseUrl: 'https://custom.parasail.example/v1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://custom.parasail.example/v1/chat/completions',
      expect.any(Object)
    );
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /Parasail 429: rate limited/
    );
  });
});
