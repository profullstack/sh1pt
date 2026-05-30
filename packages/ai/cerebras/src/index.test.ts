import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (secrets: Record<string, string> = { CEREBRAS_API_KEY: 'test-key' }, dryRun = false) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Cerebras OpenAI-compatible generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx({ CEREBRAS_API_KEY: 'test-key' }, true), 'hello', {}, {});

    expect(result).toEqual({ text: '[dry-run]', model: 'llama-3.3-70b' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi from cerebras' } }],
        model: 'llama3.1-8b',
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx(), 'hello', {
      model: 'llama3.1-8b',
      system: 'be brief',
      maxTokens: 22,
      temperature: 0.2,
      extra: { top_p: 0.9 },
    }, {});

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.cerebras.ai/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(request.body)).toEqual({
      model: 'llama3.1-8b',
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 22,
      temperature: 0.2,
      top_p: 0.9,
    });
    expect(result).toEqual({
      text: 'hi from cerebras',
      model: 'llama3.1-8b',
      inputTokens: 10,
      outputTokens: 4,
    });
  });

  it('normalizes configured base URLs with trailing slashes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }], model: 'llama-3.3-70b' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await adapter.generate(ctx(), 'hello', {}, { baseUrl: 'https://proxy.example.com/' });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://proxy.example.com/v1/chat/completions');
  });

  it('includes status and redacted response body excerpt on errors', async () => {
    const apiKey = 'test-key-crossing-truncation-boundary';
    const prefix = 'x'.repeat(190);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => `${prefix}${apiKey} server error`,
    }));

    let error: unknown;
    try {
      await adapter.generate(ctx({ CEREBRAS_API_KEY: apiKey }), 'hello', {}, {});
    } catch (exc) {
      error = exc;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Cerebras 500:');
    expect((error as Error).message).toContain('[redacted]');
    expect((error as Error).message).not.toContain(apiKey);
    expect((error as Error).message).not.toContain(apiKey.slice(0, 10));
  });
});
