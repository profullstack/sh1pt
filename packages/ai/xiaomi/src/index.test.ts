import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { XIAOMI_API_KEY: 'test-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Xiaomi MiMo OpenAI-compatible generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a Xiaomi MiMo API key', async () => {
    await expect(adapter.generate(ctx({}, false), 'hello', {}, {}))
      .rejects.toThrow('XIAOMI_API_KEY');
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx({ XIAOMI_API_KEY: 'test-key' }, true), 'hello', {}, {});

    expect(result).toEqual({ text: '[dry-run]', model: 'xiaomi/mimo-v2-flash' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completion requests and maps token usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hello from mimo' } }],
        model: 'xiaomi/mimo-v2-pro',
        usage: { prompt_tokens: 13, completion_tokens: 5 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        model: 'xiaomi/mimo-v2-pro',
        system: 'be concise',
        maxTokens: 128,
        temperature: 0.3,
        extra: { top_p: 0.95 },
      },
      {},
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.xiaomimimo.com/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(request.body)).toEqual({
      model: 'xiaomi/mimo-v2-pro',
      messages: [
        { role: 'system', content: 'be concise' },
        { role: 'user', content: 'hello' },
      ],
      stream: false,
      max_tokens: 128,
      temperature: 0.3,
      top_p: 0.95,
    });
    expect(result).toEqual({
      text: 'hello from mimo',
      model: 'xiaomi/mimo-v2-pro',
      inputTokens: 13,
      outputTokens: 5,
    });
  });

  it('uses custom base URLs without duplicate slashes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'custom' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await adapter.generate(ctx(), 'hello', {}, { baseUrl: 'https://proxy.example.test/v1/' });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://proxy.example.test/v1/chat/completions');
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error":{"message":"Invalid API Key"}}',
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(/Xiaomi MiMo 401: .*Invalid API Key/);
  });
});
