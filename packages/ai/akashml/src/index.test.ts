import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { AKASH_API_KEY: 'test-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Akash ML generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ AKASH_API_KEY: 'test-key' }, true),
      'hello',
      {},
      {},
    );

    expect(result).toEqual({ text: '[dry-run]', model: 'meta-llama/Llama-3.3-70B-Instruct' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'deepseek-ai/DeepSeek-V4-Flash',
        choices: [{ message: { role: 'assistant', content: 'hi from akash' } }],
        usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        model: 'deepseek-ai/DeepSeek-V4-Flash',
        system: 'be concise',
        maxTokens: 48,
        temperature: 0.3,
        extra: { top_p: 0.8, seed: 42 },
      },
      {},
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://chatapi.akash.network/api/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({
      model: 'deepseek-ai/DeepSeek-V4-Flash',
      messages: [
        { role: 'system', content: 'be concise' },
        { role: 'user', content: 'hello' },
      ],
      stream: false,
      max_tokens: 48,
      temperature: 0.3,
      top_p: 0.8,
      seed: 42,
    });
    expect(result).toEqual({
      text: 'hi from akash',
      model: 'deepseek-ai/DeepSeek-V4-Flash',
      inputTokens: 12,
      outputTokens: 4,
    });
  });

  it('supports text-style choices from compatible responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ text: 'legacy text response' }],
      }),
    }));

    const result = await adapter.generate(
      ctx(),
      'hello',
      { model: 'Qwen/Qwen3.6-35B-A3B' },
      { baseUrl: 'https://akash.test/api/v1' },
    );

    expect(result).toEqual({
      text: 'legacy text response',
      model: 'Qwen/Qwen3.6-35B-A3B',
    });
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /Akash ML 429: rate limited/,
    );
  });
});
