import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { BASETEN_API_KEY: 'test-key' },
  dryRun = false
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Baseten chat completions generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ BASETEN_API_KEY: 'test-key' }, true),
      'hello',
      {},
      {}
    );

    expect(result).toEqual({ text: '[dry-run]', model: 'deepseek-ai/DeepSeek-V3.1' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests with Api-Key auth and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi from baseten' } }],
        model: 'deepseek-ai/DeepSeek-V3-0324',
        usage: { prompt_tokens: 20, completion_tokens: 11 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        model: 'deepseek-ai/DeepSeek-V3-0324',
        system: 'be practical',
        maxTokens: 100,
        temperature: 0.2,
        extra: { top_p: 0.9 },
      },
      {}
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://inference.baseten.co/v1/chat/completions');
    expect(request.headers.authorization).toBe('Api-Key test-key');
    expect(JSON.parse(request.body)).toEqual({
      model: 'deepseek-ai/DeepSeek-V3-0324',
      messages: [
        { role: 'system', content: 'be practical' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 100,
      temperature: 0.2,
      top_p: 0.9,
    });
    expect(result).toEqual({
      text: 'hi from baseten',
      model: 'deepseek-ai/DeepSeek-V3-0324',
      inputTokens: 20,
      outputTokens: 11,
    });
  });

  it('uses a configured self-deployed model base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
        model: 'custom-model',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await adapter.generate(ctx(), 'hello', { model: 'custom-model' }, {
      baseUrl: 'https://model-abc123.api.baseten.co/v1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://model-abc123.api.baseten.co/v1/chat/completions',
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
      /Baseten 401: unauthorized/
    );
  });
});
