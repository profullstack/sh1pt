import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { MANCER_API_KEY: 'test-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Mancer generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a Mancer API key', async () => {
    await expect(adapter.generate(ctx({}, false), 'hello', {}, {})).rejects.toThrow(
      'MANCER_API_KEY not in vault',
    );
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx({ MANCER_API_KEY: 'test-key' }, true), 'hello', {}, {});

    expect(result).toEqual({ text: '[dry-run]', model: 'mancer/weaver' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts WaveSpeedAI chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'mancer/weaver',
        choices: [{ message: { role: 'assistant', content: 'hi from mancer' } }],
        usage: { prompt_tokens: 10, completion_tokens: 6, total_tokens: 16 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        system: 'be vivid',
        maxTokens: 64,
        temperature: 0.5,
        extra: { top_p: 0.9 },
      },
      {},
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://llm.wavespeed.ai/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({
      model: 'mancer/weaver',
      messages: [
        { role: 'system', content: 'be vivid' },
        { role: 'user', content: 'hello' },
      ],
      stream: false,
      max_tokens: 64,
      temperature: 0.5,
      top_p: 0.9,
    });
    expect(result).toEqual({
      text: 'hi from mancer',
      model: 'mancer/weaver',
      inputTokens: 10,
      outputTokens: 6,
    });
  });

  it('supports compatible text-style choices and custom base URLs', async () => {
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
      { model: 'mancer/weaver' },
      { baseUrl: 'https://gateway.example.test/v1' },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://gateway.example.test/v1/chat/completions');
    expect(result).toEqual({
      text: 'legacy text response',
      model: 'mancer/weaver',
    });
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /Mancer 429: rate limited/,
    );
  });
});
