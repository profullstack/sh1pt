import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (secrets: Record<string, string> = { DEEPINFRA_API_KEY: 'test-deepinfra-key' }, dryRun = false) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('DeepInfra OpenAI-compatible generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx({ DEEPINFRA_API_KEY: 'test-deepinfra-key' }, true), 'hello', {}, {});

    expect(result).toEqual({ text: '[dry-run]', model: 'deepseek-ai/DeepSeek-V3' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi from deepinfra' } }],
        model: 'deepseek-ai/DeepSeek-R1',
        usage: { prompt_tokens: 11, completion_tokens: 6 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx(), 'hello', {
      model: 'deepseek-ai/DeepSeek-R1',
      system: 'be brief',
      maxTokens: 20,
      temperature: 0.2,
      extra: { reasoning_effort: 'low' },
    }, { baseUrl: 'https://deepinfra.test/v1/openai/' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://deepinfra.test/v1/openai/chat/completions');
    expect(request.headers.authorization).toBe(['Bearer', 'test-deepinfra-key'].join(' '));
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({
      model: 'deepseek-ai/DeepSeek-R1',
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 20,
      temperature: 0.2,
      reasoning_effort: 'low',
    });
    expect(result).toEqual({
      text: 'hi from deepinfra',
      model: 'deepseek-ai/DeepSeek-R1',
      inputTokens: 11,
      outputTokens: 6,
    });
  });

  it('redacts DeepInfra keys from provider error excerpts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited for test-deepinfra-key',
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      'DeepInfra 429: rate limited for [redacted]',
    );
  });
});
