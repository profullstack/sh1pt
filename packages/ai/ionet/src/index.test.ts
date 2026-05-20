import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { IOINTELLIGENCE_API_KEY: 'test-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('io.net IO Intelligence generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ IOINTELLIGENCE_API_KEY: 'test-key' }, true),
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
        model: 'meta-llama/Llama-3.3-70B-Instruct',
        choices: [{ message: { role: 'assistant', content: 'hi from io intelligence' } }],
        usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        system: 'be direct',
        maxTokens: 50,
        temperature: 0.7,
        extra: { top_p: 0.9, request_id: 'req-test' },
      },
      {},
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.intelligence.io.solutions/api/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({
      model: 'meta-llama/Llama-3.3-70B-Instruct',
      messages: [
        { role: 'system', content: 'be direct' },
        { role: 'user', content: 'hello' },
      ],
      stream: false,
      max_tokens: 50,
      temperature: 0.7,
      top_p: 0.9,
      request_id: 'req-test',
    });
    expect(result).toEqual({
      text: 'hi from io intelligence',
      model: 'meta-llama/Llama-3.3-70B-Instruct',
      inputTokens: 10,
      outputTokens: 4,
    });
  });

  it('supports text-style choices from compatible responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'Qwen/Qwen2-VL-7B-Instruct',
        choices: [{ text: 'legacy text response' }],
      }),
    }));

    const result = await adapter.generate(ctx(), 'hello', {}, { baseUrl: 'https://ionet.test/api/v1' });

    expect(result).toEqual({
      text: 'legacy text response',
      model: 'Qwen/Qwen2-VL-7B-Instruct',
    });
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limit exceeded'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /io.net 429: rate limit exceeded/,
    );
  });
});
