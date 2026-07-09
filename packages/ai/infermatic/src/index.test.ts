import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { INFERMATIC_API_KEY: 'test-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Infermatic chat completions generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ INFERMATIC_API_KEY: 'test-key' }, true),
      'hello',
      {},
      {},
    );

    expect(result).toEqual({
      text: '[dry-run]',
      model: 'Sao10K-72B-Qwen2.5-Kunou-v1-FP8-Dynamic',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'Sao10K-L3.3-70B-Euryale-v2.3-FP8-Dynamic',
        choices: [{ message: { role: 'assistant', content: 'hi from infermatic' } }],
        usage: { prompt_tokens: 9, completion_tokens: 6, total_tokens: 15 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        model: 'Sao10K-L3.3-70B-Euryale-v2.3-FP8-Dynamic',
        system: 'be concise',
        maxTokens: 48,
        temperature: 0.4,
        extra: { top_k: 40, repetition_penalty: 1.1 },
      },
      {},
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.totalgpt.ai/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({
      model: 'Sao10K-L3.3-70B-Euryale-v2.3-FP8-Dynamic',
      messages: [
        { role: 'system', content: 'be concise' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 48,
      temperature: 0.4,
      top_k: 40,
      repetition_penalty: 1.1,
    });
    expect(result).toEqual({
      text: 'hi from infermatic',
      model: 'Sao10K-L3.3-70B-Euryale-v2.3-FP8-Dynamic',
      inputTokens: 9,
      outputTokens: 6,
    });
  });

  it('supports text-style choices from compatible responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'TheDrummer-UnslopNemo-12B-v4.1',
        choices: [{ text: 'legacy text response' }],
      }),
    }));

    const result = await adapter.generate(ctx(), 'hello', {}, { baseUrl: 'https://infermatic.test' });

    expect(result).toEqual({
      text: 'legacy text response',
      model: 'TheDrummer-UnslopNemo-12B-v4.1',
    });
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'unsupported system prompt'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /Infermatic 500: unsupported system prompt/,
    );
  });
});
