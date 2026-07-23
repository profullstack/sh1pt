import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { NOVITA_API_KEY: 'test-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Novita AI generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ NOVITA_API_KEY: 'test-key' }, true),
      'hello',
      {},
      {},
    );

    expect(result).toEqual({ text: '[dry-run]', model: 'meta-llama/llama-3.1-8b-instruct' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'deepseek/deepseek-chat',
        choices: [{ message: { content: 'hi from novita' } }],
        usage: { prompt_tokens: 9, completion_tokens: 4 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        model: 'deepseek/deepseek-chat',
        system: 'be direct',
        maxTokens: 64,
        temperature: 0.4,
        extra: { top_p: 0.8 },
      },
      { baseUrl: 'https://novita.test/v3/openai/' },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://novita.test/v3/openai/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({
      model: 'deepseek/deepseek-chat',
      messages: [
        { role: 'system', content: 'be direct' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 64,
      temperature: 0.4,
      top_p: 0.8,
    });
    expect(result).toEqual({
      text: 'hi from novita',
      model: 'deepseek/deepseek-chat',
      inputTokens: 9,
      outputTokens: 4,
    });
  });

  it.each([
    ['missing scheme', 'novita.test/v3/openai'],
    ['ftp scheme', 'ftp://novita.test/v3/openai'],
    ['credentials', 'https://user:pass@novita.test/v3/openai'],
    ['query string', 'https://novita.test/v3/openai?token=secret'],
    ['fragment', 'https://novita.test/v3/openai#chat'],
  ])('rejects unclean custom baseUrl values: %s', async (_label, baseUrl) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.generate(ctx(), 'hello', {}, { baseUrl })).rejects.toThrow(
      /Novita baseUrl/,
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
      /novita 401: invalid api key/,
    );
  });
});
