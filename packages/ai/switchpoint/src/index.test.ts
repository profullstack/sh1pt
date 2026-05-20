import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { SWITCHPOINT_API_KEY: 'test-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Switchpoint OpenAI-compatible generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a Switchpoint API key', async () => {
    await expect(adapter.generate(ctx({}, false), 'hello', {}, {}))
      .rejects.toThrow('SWITCHPOINT_API_KEY');
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ SWITCHPOINT_API_KEY: 'test-key' }, true),
      'hello',
      {},
      {},
    );

    expect(result).toEqual({ text: '[dry-run]', model: 'switchpoint/router' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completion requests and maps token usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'routed answer' } }],
        model: 'switchpoint/router',
        usage: { prompt_tokens: 13, completion_tokens: 5 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'route this prompt',
      {
        system: 'be direct',
        maxTokens: 96,
        temperature: 0.3,
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
    expect(JSON.parse(request.body)).toEqual({
      model: 'switchpoint/router',
      messages: [
        { role: 'system', content: 'be direct' },
        { role: 'user', content: 'route this prompt' },
      ],
      stream: false,
      max_tokens: 96,
      temperature: 0.3,
      top_p: 0.9,
    });
    expect(result).toEqual({
      text: 'routed answer',
      model: 'switchpoint/router',
      inputTokens: 13,
      outputTokens: 5,
    });
  });

  it('does not duplicate an existing Bearer prefix', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ text: 'ok' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await adapter.generate(ctx({ SWITCHPOINT_API_KEY: 'Bearer supplied' }), 'hello', {}, {});

    expect(fetchMock.mock.calls[0]?.[1].headers.authorization).toBe('Bearer supplied');
  });

  it('uses custom base URLs without duplicate slashes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ text: 'custom' }] }),
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

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(/Switchpoint 429: rate limit/);
  });

  it('fails clearly when a response has no generated text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{}] }),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow('generated text');
  });
});
