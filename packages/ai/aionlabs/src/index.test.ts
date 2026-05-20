import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { AIONLABS_API_KEY: 'test-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('AionLabs OpenAI-compatible generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ AIONLABS_API_KEY: 'test-key' }, true),
      'hello',
      {},
      {},
    );

    expect(result).toEqual({ text: '[dry-run]', model: 'aion-1.0-mini' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi from aion', reasoning: 'brief' } }],
        model: 'aion-labs/aion-2.0',
        usage: { prompt_tokens: 11, completion_tokens: 7 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        model: 'aion-labs/aion-2.0',
        system: 'be direct',
        maxTokens: 64,
        temperature: 0.2,
        extra: { reasoning_split: false },
      },
      {},
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.aionlabs.ai/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(request.body)).toEqual({
      model: 'aion-labs/aion-2.0',
      messages: [
        { role: 'system', content: 'be direct' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 64,
      temperature: 0.2,
      reasoning_split: false,
    });
    expect(result).toEqual({
      text: 'hi from aion',
      model: 'aion-labs/aion-2.0',
      inputTokens: 11,
      outputTokens: 7,
    });
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'provider error'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /AionLabs 502: provider error/,
    );
  });
});
