import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (secrets: Record<string, string> = { FRIENDLI_TOKEN: 'test-friendli-key' }, dryRun = false) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Friendli chat completions generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx({ FRIENDLI_TOKEN: 'test-friendli-key' }, true), 'hello', {}, {});

    expect(result).toEqual({ text: '[dry-run]', model: 'meta-llama/Llama-3.1-8B-Instruct' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi from friendli' } }],
        model: 'meta-llama/Llama-3.1-8B-Instruct',
        usage: { prompt_tokens: 7, completion_tokens: 4 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx(), 'hello', {
      system: 'be brief',
      maxTokens: 32,
      temperature: 0.3,
      extra: { top_p: 0.8 },
    }, { baseUrl: 'https://friendli.test/serverless/' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://friendli.test/serverless/v1/chat/completions');
    expect(request.headers.authorization).toBe(['Bearer', 'test-friendli-key'].join(' '));
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({
      model: 'meta-llama/Llama-3.1-8B-Instruct',
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 32,
      temperature: 0.3,
      top_p: 0.8,
    });
    expect(result).toEqual({
      text: 'hi from friendli',
      model: 'meta-llama/Llama-3.1-8B-Instruct',
      inputTokens: 7,
      outputTokens: 4,
    });
  });

  it('redacts Friendli tokens from provider error excerpts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'bad token test-friendli-key',
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      'Friendli 401: bad token [redacted]',
    );
  });
});
