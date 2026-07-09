import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { FAL_API_KEY: 'test-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Liquid AI Fal generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a Fal API key', async () => {
    await expect(adapter.generate(ctx({}, false), 'hello', {}, {}))
      .rejects.toThrow('FAL_API_KEY');
  });

  it('short-circuits dry-run before network calls or baseUrl checks', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx({ FAL_API_KEY: 'test-key' }, true), 'hello', {}, {});

    expect(result).toEqual({ text: '[dry-run]', model: 'LiquidAI/LFM2-8B-A1B' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires a deployment base URL for live calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.generate(ctx(), 'hello', {}, {}))
      .rejects.toThrow('baseUrl');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completion requests and maps token usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hello from liquid' } }],
        model: 'LiquidAI/LFM2-8B-A1B',
        usage: { prompt_tokens: 9, completion_tokens: 4 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        system: 'be concise',
        maxTokens: 32,
        temperature: 0,
        extra: { top_p: 0.8 },
      },
      { baseUrl: 'https://fal.run/acme/lfm2/v1/' },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://fal.run/acme/lfm2/v1/chat/completions');
    expect(request.headers.authorization).toBe('Key test-key');
    expect(JSON.parse(request.body)).toEqual({
      model: 'LiquidAI/LFM2-8B-A1B',
      messages: [
        { role: 'system', content: 'be concise' },
        { role: 'user', content: 'hello' },
      ],
      stream: false,
      max_tokens: 32,
      temperature: 0,
      top_p: 0.8,
    });
    expect(result).toEqual({
      text: 'hello from liquid',
      model: 'LiquidAI/LFM2-8B-A1B',
      inputTokens: 9,
      outputTokens: 4,
    });
  });

  it('accepts the legacy Liquid secret name for existing vault entries', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'legacy' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await adapter.generate(
      ctx({ LIQUID_API_KEY: 'legacy-key' }),
      'hello',
      {},
      { baseUrl: 'https://fal.run/acme/lfm2/v1' },
    );

    expect(fetchMock.mock.calls[0]?.[1].headers.authorization).toBe('Key legacy-key');
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limit'.repeat(40),
    }));

    await expect(
      adapter.generate(ctx(), 'hello', {}, { baseUrl: 'https://fal.run/acme/lfm2/v1' }),
    ).rejects.toThrow(/Liquid AI 429: rate limit/);
  });
});
