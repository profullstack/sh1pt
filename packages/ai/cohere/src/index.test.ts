import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (secrets: Record<string, string> = { COHERE_API_KEY: 'test-key' }, dryRun = false) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Cohere v2 chat generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx({ COHERE_API_KEY: 'test-key' }, true), 'hello', {}, {});

    expect(result).toEqual({ text: '[dry-run]', model: 'command-a-03-2025' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts v2 chat requests and maps token usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'command-r7b-12-2024',
        message: {
          content: [
            { type: 'text', text: 'hi ' },
            { type: 'text', text: 'from cohere' },
          ],
        },
        usage: {
          tokens: { input_tokens: 14, output_tokens: 5 },
          billed_units: { input_tokens: 1, output_tokens: 1 },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx(), 'hello', {
      model: 'command-r7b-12-2024',
      system: 'be brief',
      maxTokens: 30,
      temperature: 0.2,
      extra: { p: 0.8, safety_mode: 'STRICT' },
    }, {});

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.cohere.com/v2/chat');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({
      stream: false,
      model: 'command-r7b-12-2024',
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 30,
      temperature: 0.2,
      p: 0.8,
      safety_mode: 'STRICT',
    });
    expect(result).toEqual({
      text: 'hi from cohere',
      model: 'command-r7b-12-2024',
      inputTokens: 14,
      outputTokens: 5,
    });
  });

  it('falls back to billed units when token counts are absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { content: 'plain string response' },
        usage: { billed_units: { input_tokens: 2, output_tokens: 3 } },
      }),
    }));

    const result = await adapter.generate(ctx(), 'hello', {}, { baseUrl: 'https://cohere.test' });

    expect(result).toEqual({
      text: 'plain string response',
      model: 'command-a-03-2025',
      inputTokens: 2,
      outputTokens: 3,
    });
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid api key'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(/Cohere 401: invalid api key/);
  });
});
