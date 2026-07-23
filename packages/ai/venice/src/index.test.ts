import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { VENICE_API_KEY: 'test-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Venice AI generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ VENICE_API_KEY: 'test-key' }, true),
      'hello',
      {},
      {},
    );

    expect(result).toEqual({ text: '[dry-run]', model: 'mistral-31-24b' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'llama-3.3-70b',
        choices: [{ message: { content: 'hi from venice' } }],
        usage: { prompt_tokens: 7, completion_tokens: 3 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        model: 'llama-3.3-70b',
        system: 'be direct',
        maxTokens: 64,
        temperature: 0.4,
        extra: { top_p: 0.8 },
      },
      { baseUrl: 'https://venice.test/api/v1/' },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://venice.test/api/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({
      model: 'llama-3.3-70b',
      messages: [
        { role: 'system', content: 'be direct' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 64,
      temperature: 0.4,
      top_p: 0.8,
    });
    expect(result).toEqual({
      text: 'hi from venice',
      model: 'llama-3.3-70b',
      inputTokens: 7,
      outputTokens: 3,
    });
  });

  it.each([
    ['missing scheme', 'venice.test/api/v1'],
    ['ftp scheme', 'ftp://venice.test/api/v1'],
    ['credentials', 'https://user:pass@venice.test/api/v1'],
    ['query string', 'https://venice.test/api/v1?token=secret'],
    ['fragment', 'https://venice.test/api/v1#chat'],
  ])('rejects unclean custom baseUrl values: %s', async (_label, baseUrl) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.generate(ctx(), 'hello', {}, { baseUrl })).rejects.toThrow(
      /Venice baseUrl/,
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
      /venice 401: invalid api key/,
    );
  });
});
