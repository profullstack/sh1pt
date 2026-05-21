import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { MINIMAX_API_KEY: 'test-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('MiniMax OpenAI-compatible generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a MiniMax API key', async () => {
    await expect(adapter.generate(ctx({}, false), 'hello', {}, {}))
      .rejects.toThrow('MINIMAX_API_KEY');
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx({ MINIMAX_API_KEY: 'test-key' }, true), 'hello', {}, {});

    expect(result).toEqual({ text: '[dry-run]', model: 'MiniMax-M2.7' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completion requests and maps token usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '<think>brief</think>\nhello from minimax' } }],
        model: 'MiniMax-M2.7-highspeed',
        usage: { prompt_tokens: 12, completion_tokens: 8 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        model: 'MiniMax-M2.7-highspeed',
        system: 'be concise',
        maxTokens: 64,
        temperature: 0.7,
        extra: { top_p: 0.9, reasoning_split: true },
      },
      {},
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.minimax.io/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(request.body)).toEqual({
      model: 'MiniMax-M2.7-highspeed',
      messages: [
        { role: 'system', content: 'be concise' },
        { role: 'user', content: 'hello' },
      ],
      stream: false,
      max_completion_tokens: 64,
      temperature: 0.7,
      top_p: 0.9,
      reasoning_split: true,
    });
    expect(result).toEqual({
      text: '<think>brief</think>\nhello from minimax',
      model: 'MiniMax-M2.7-highspeed',
      inputTokens: 12,
      outputTokens: 8,
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
      status: 429,
      text: async () => 'rate limit'.repeat(40),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(/MiniMax 429: rate limit/);
  });
});
