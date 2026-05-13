import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { FEATHERLESS_API_KEY: 'test-key' },
  dryRun = false
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Featherless OpenAI-compatible generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ FEATHERLESS_API_KEY: 'test-key' }, true),
      'hello',
      {},
      {}
    );

    expect(result).toEqual({ text: '[dry-run]', model: 'Qwen/Qwen2.5-7B-Instruct' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi from featherless' } }],
        model: 'GalrionSoftworks/Margnum-12B-v1',
        usage: { prompt_tokens: 11, completion_tokens: 6 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        model: 'GalrionSoftworks/Margnum-12B-v1',
        system: 'be helpful',
        maxTokens: 40,
        temperature: 0.5,
        extra: { top_p: 0.9, min_p: 0.05 },
      },
      {}
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.featherless.ai/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(request.headers['HTTP-Referer']).toBe('https://github.com/profullstack/sh1pt');
    expect(request.headers['X-Title']).toBe('sh1pt');
    expect(JSON.parse(request.body)).toEqual({
      model: 'GalrionSoftworks/Margnum-12B-v1',
      messages: [
        { role: 'system', content: 'be helpful' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 40,
      temperature: 0.5,
      top_p: 0.9,
      min_p: 0.05,
    });
    expect(result).toEqual({
      text: 'hi from featherless',
      model: 'GalrionSoftworks/Margnum-12B-v1',
      inputTokens: 11,
      outputTokens: 6,
    });
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /Featherless 401: unauthorized/
    );
  });
});
