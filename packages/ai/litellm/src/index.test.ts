import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (secrets: Record<string, string> = { LITELLM_API_KEY: 'test-key' }, dryRun = false) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('LiteLLM OpenAI-compatible generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx({ LITELLM_API_KEY: 'test-key' }, true), 'hello', {}, {});

    expect(result).toEqual({ text: '[dry-run]', model: 'gpt-4o-mini' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi from litellm' } }],
        model: 'anthropic/claude-3-5-sonnet',
        usage: { prompt_tokens: 11, completion_tokens: 5 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx(), 'hello', {
      model: 'anthropic/claude-3-5-sonnet',
      system: 'be brief',
      maxTokens: 20,
      temperature: 0.2,
      extra: { top_p: 0.9 },
    }, { baseUrl: 'https://proxy.example.com/' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://proxy.example.com/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(request.body)).toEqual({
      model: 'anthropic/claude-3-5-sonnet',
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 20,
      temperature: 0.2,
      top_p: 0.9,
    });
    expect(result).toEqual({
      text: 'hi from litellm',
      model: 'anthropic/claude-3-5-sonnet',
      inputTokens: 11,
      outputTokens: 5,
    });
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid proxy key'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(/LiteLLM 401: invalid proxy key/);
  });
});
