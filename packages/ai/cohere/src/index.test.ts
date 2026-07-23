import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { COHERE_API_KEY: 'test-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Cohere generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ COHERE_API_KEY: 'test-key' }, true),
      'hello',
      {},
      {},
    );

    expect(result).toEqual({ text: '[dry-run]', model: 'command-r-plus' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'command-r',
        choices: [{ message: { content: 'hi from cohere' } }],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        model: 'command-r',
        system: 'be direct',
        maxTokens: 64,
        temperature: 0.4,
        extra: { seed: 7 },
      },
      { baseUrl: 'https://cohere.test/compatibility/v1/' },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://cohere.test/compatibility/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({
      model: 'command-r',
      messages: [
        { role: 'system', content: 'be direct' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 64,
      temperature: 0.4,
      seed: 7,
    });
    expect(result).toEqual({
      text: 'hi from cohere',
      model: 'command-r',
      inputTokens: 10,
      outputTokens: 4,
    });
  });

  it.each([
    ['missing scheme', 'cohere.test/compatibility/v1'],
    ['ftp scheme', 'ftp://cohere.test/compatibility/v1'],
    ['credentials', 'https://user:pass@cohere.test/compatibility/v1'],
    ['query string', 'https://cohere.test/compatibility/v1?token=secret'],
    ['fragment', 'https://cohere.test/compatibility/v1#chat'],
  ])('rejects unclean custom baseUrl values: %s', async (_label, baseUrl) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.generate(ctx(), 'hello', {}, { baseUrl })).rejects.toThrow(
      /Cohere baseUrl/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid api key'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /cohere 401: invalid api key/,
    );
  });
});
