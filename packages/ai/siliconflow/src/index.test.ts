import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { SILICONFLOW_API_KEY: 'test-key' },
  dryRun = false
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('SiliconFlow OpenAI-compatible generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ SILICONFLOW_API_KEY: 'test-key' }, true),
      'hello',
      {},
      {}
    );

    expect(result).toEqual({ text: '[dry-run]', model: 'Qwen/QwQ-32B' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi from siliconflow', reasoning_content: 'brief' } }],
        model: 'deepseek-ai/DeepSeek-V3.2',
        usage: { prompt_tokens: 12, completion_tokens: 7 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        model: 'deepseek-ai/DeepSeek-V3.2',
        system: 'be useful',
        maxTokens: 48,
        temperature: 0.6,
        extra: { top_p: 0.95 },
      },
      {}
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.siliconflow.com/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(request.body)).toEqual({
      model: 'deepseek-ai/DeepSeek-V3.2',
      messages: [
        { role: 'system', content: 'be useful' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 48,
      temperature: 0.6,
      top_p: 0.95,
    });
    expect(result).toEqual({
      text: 'hi from siliconflow',
      model: 'deepseek-ai/DeepSeek-V3.2',
      inputTokens: 12,
      outputTokens: 7,
    });
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /SiliconFlow 429: rate limited/
    );
  });
});
