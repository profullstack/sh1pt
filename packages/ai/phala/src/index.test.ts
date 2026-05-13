import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { PHALA_API_KEY: 'test-key' },
  dryRun = false
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Phala confidential AI chat completions generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ PHALA_API_KEY: 'test-key' }, true),
      'hello',
      {},
      {}
    );

    expect(result).toEqual({ text: '[dry-run]', model: 'phala/deepseek-chat-v3-0324' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi from phala' } }],
        model: 'openai/gpt-oss-120b',
        usage: { prompt_tokens: 22, completion_tokens: 9 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        model: 'openai/gpt-oss-120b',
        system: 'be private',
        maxTokens: 80,
        temperature: 0.1,
        extra: { top_p: 0.95 },
      },
      {}
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.redpill.ai/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(request.body)).toEqual({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: 'be private' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 80,
      temperature: 0.1,
      top_p: 0.95,
    });
    expect(result).toEqual({
      text: 'hi from phala',
      model: 'openai/gpt-oss-120b',
      inputTokens: 22,
      outputTokens: 9,
    });
  });

  it('uses a configured base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
        model: 'custom-confidential-model',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await adapter.generate(ctx(), 'hello', { model: 'custom-confidential-model' }, {
      baseUrl: 'https://confidential.example/v1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://confidential.example/v1/chat/completions',
      expect.any(Object)
    );
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => 'insufficient funds'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /Phala 402: insufficient funds/
    );
  });
});
