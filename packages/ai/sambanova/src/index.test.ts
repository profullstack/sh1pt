import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { SAMBANOVA_API_KEY: 'test-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('SambaNova generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a SambaNova API key', async () => {
    await expect(adapter.generate(ctx({}, false), 'hello', {}, {})).rejects.toThrow(
      /SAMBANOVA_API_KEY/,
    );
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ SAMBANOVA_API_KEY: 'test-key' }, true),
      'hello',
      {},
      {},
    );

    expect(result).toEqual({ text: '[dry-run]', model: 'gpt-oss-120b' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gpt-oss-120b',
        choices: [{ message: { role: 'assistant', content: 'hi from sambanova' } }],
        usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        system: 'be direct',
        maxTokens: 96,
        temperature: 0.4,
        extra: { top_p: 0.9, top_k: 5 },
      },
      {},
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.sambanova.ai/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({
      model: 'gpt-oss-120b',
      messages: [
        { role: 'system', content: 'be direct' },
        { role: 'user', content: 'hello' },
      ],
      stream: false,
      max_tokens: 96,
      temperature: 0.4,
      top_p: 0.9,
      top_k: 5,
    });
    expect(result).toEqual({
      text: 'hi from sambanova',
      model: 'gpt-oss-120b',
      inputTokens: 12,
      outputTokens: 5,
    });
  });

  it('supports text-style choices and custom base URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ text: 'legacy compatible response' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      { model: 'Meta-Llama-3.1-8B-Instruct' },
      { baseUrl: 'https://sambanova.test/v1/' },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://sambanova.test/v1/chat/completions');
    expect(result).toEqual({
      text: 'legacy compatible response',
      model: 'Meta-Llama-3.1-8B-Instruct',
    });
  });

  it('includes status and redacted response body excerpts on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid api key test-key',
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /SambaNova 401: invalid api key \[redacted\]/,
    );
  });
});
