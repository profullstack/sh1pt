import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (secrets: Record<string, string> = { NEBIUS_API_KEY: 'test-key' }, dryRun = false) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Nebius Token Factory chat completions generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx({ NEBIUS_API_KEY: 'test-key' }, true), 'hello', {}, {});

    expect(result).toEqual({ text: '[dry-run]', model: 'meta-llama/Llama-3.3-70B-Instruct' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'deepseek-ai/DeepSeek-R1-0528',
        choices: [{ message: { role: 'assistant', content: 'hi from nebius' } }],
        usage: { prompt_tokens: 13, completion_tokens: 5, total_tokens: 18 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx(), 'hello', {
      model: 'deepseek-ai/DeepSeek-R1-0528',
      system: 'be brief',
      maxTokens: 28,
      temperature: 0.3,
      extra: { top_p: 0.8, service_tier: 'auto' },
    }, {});

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.tokenfactory.nebius.com/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({
      stream: false,
      model: 'deepseek-ai/DeepSeek-R1-0528',
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 28,
      temperature: 0.3,
      top_p: 0.8,
      service_tier: 'auto',
    });
    expect(result).toEqual({
      text: 'hi from nebius',
      model: 'deepseek-ai/DeepSeek-R1-0528',
      inputTokens: 13,
      outputTokens: 5,
    });
  });

  it('supports text-style choices from compatible Nebius responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'meta-llama/Llama-3.3-70B-Instruct',
        choices: [{ text: 'text choice response' }],
      }),
    }));

    const result = await adapter.generate(ctx(), 'hello', {}, { baseUrl: 'https://nebius.test' });

    expect(result).toEqual({
      text: 'text choice response',
      model: 'meta-llama/Llama-3.3-70B-Instruct',
    });
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'invalid request'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(/Nebius 422: invalid request/);
  });
});
