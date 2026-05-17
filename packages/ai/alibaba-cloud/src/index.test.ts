import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { DASHSCOPE_API_KEY: 'test-key' },
  dryRun = false
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Alibaba Cloud OpenAI-compatible generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ DASHSCOPE_API_KEY: 'test-key' }, true),
      'hello',
      {},
      {}
    );

    expect(result).toEqual({ text: '[dry-run]', model: 'qwen-plus' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi from qwen' } }],
        model: 'qwen3.5-plus',
        usage: { prompt_tokens: 16, completion_tokens: 8 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        model: 'qwen3.5-plus',
        system: 'be practical',
        maxTokens: 90,
        temperature: 0.3,
        extra: { enable_thinking: false },
      },
      {}
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(request.body)).toEqual({
      model: 'qwen3.5-plus',
      messages: [
        { role: 'system', content: 'be practical' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 90,
      temperature: 0.3,
      enable_thinking: false,
    });
    expect(result).toEqual({
      text: 'hi from qwen',
      model: 'qwen3.5-plus',
      inputTokens: 16,
      outputTokens: 8,
    });
  });

  it('uses a configured region base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
        model: 'qwen-flash',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await adapter.generate(ctx(), 'hello', { model: 'qwen-flash' }, {
      baseUrl: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://dashscope-us.aliyuncs.com/compatible-mode/v1/chat/completions',
      expect.any(Object)
    );
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /Alibaba Cloud 401: unauthorized/
    );
  });
});
