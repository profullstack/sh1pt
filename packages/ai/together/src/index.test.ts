import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { TOGETHER_API_KEY: 'test-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Together AI generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ TOGETHER_API_KEY: 'test-key' }, true),
      'hello',
      {},
      {},
    );

    expect(result).toEqual({ text: '[dry-run]', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        choices: [{ message: { role: 'assistant', content: 'hi from together' } }],
        usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        system: 'be direct',
        maxTokens: 60,
        temperature: 0.6,
        extra: { top_p: 0.8, request_id: 'req-test' },
      },
      {},
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.together.ai/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({
      model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      messages: [
        { role: 'system', content: 'be direct' },
        { role: 'user', content: 'hello' },
      ],
      stream: false,
      max_tokens: 60,
      temperature: 0.6,
      top_p: 0.8,
      request_id: 'req-test',
    });
    expect(result).toEqual({
      text: 'hi from together',
      model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      inputTokens: 12,
      outputTokens: 5,
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
      { model: 'Qwen/Qwen3.5-9B' },
      { baseUrl: 'https://together.test/v1' },
    );

    expect(result).toEqual({
      text: 'legacy text response',
      model: 'Qwen/Qwen3.5-9B',
    });
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid api key'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /Together AI 401: invalid api key/,
    );
  });
});
