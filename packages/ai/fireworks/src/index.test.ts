import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { FIREWORKS_API_KEY: 'test-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Fireworks AI generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a Fireworks API key', async () => {
    await expect(adapter.generate(ctx({}, false), 'hello', {}, {})).rejects.toThrow(
      /FIREWORKS_API_KEY/,
    );
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ FIREWORKS_API_KEY: 'test-key' }, true),
      'hello',
      {},
      {},
    );

    expect(result).toEqual({
      text: '[dry-run]',
      model: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
        choices: [{ message: { role: 'assistant', content: 'hi from fireworks' } }],
        usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        system: 'be direct',
        maxTokens: 80,
        temperature: 0.5,
        extra: { top_p: 0.9, request_id: 'req-fireworks' },
      },
      {},
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.fireworks.ai/inference/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({
      model: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
      messages: [
        { role: 'system', content: 'be direct' },
        { role: 'user', content: 'hello' },
      ],
      stream: false,
      max_tokens: 80,
      temperature: 0.5,
      top_p: 0.9,
      request_id: 'req-fireworks',
    });
    expect(result).toEqual({
      text: 'hi from fireworks',
      model: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
      inputTokens: 11,
      outputTokens: 4,
    });
  });

  it('supports text-style choices and custom base URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ text: 'legacy text response' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      { model: 'accounts/fireworks/models/llama-v3p1-8b-instruct' },
      { baseUrl: 'https://fireworks.test/inference/v1/' },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://fireworks.test/inference/v1/chat/completions');
    expect(result).toEqual({
      text: 'legacy text response',
      model: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
    });
  });

  it('includes status and redacted response body excerpts on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid api key test-key',
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /Fireworks AI 401: invalid api key \[redacted\]/,
    );
  });
});
