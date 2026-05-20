import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { WANDB_API_KEY: 'test-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('W&B Inference generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ WANDB_API_KEY: 'test-key' }, true),
      'hello',
      {},
      {},
    );

    expect(result).toEqual({ text: '[dry-run]', model: 'meta-llama/Llama-3.1-8B-Instruct' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'meta-llama/Llama-3.1-8B-Instruct',
        choices: [{ message: { role: 'assistant', content: 'hi from wandb' } }],
        usage: { prompt_tokens: 11, completion_tokens: 3, total_tokens: 14 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        system: 'be direct',
        maxTokens: 70,
        temperature: 0.5,
        extra: { top_p: 0.9, request_id: 'req-test' },
      },
      { project: 'team/project' },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.inference.wandb.ai/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(request.headers['content-type']).toBe('application/json');
    expect(request.headers['OpenAI-Project']).toBe('team/project');
    expect(JSON.parse(request.body)).toEqual({
      model: 'meta-llama/Llama-3.1-8B-Instruct',
      messages: [
        { role: 'system', content: 'be direct' },
        { role: 'user', content: 'hello' },
      ],
      stream: false,
      max_tokens: 70,
      temperature: 0.5,
      top_p: 0.9,
      request_id: 'req-test',
    });
    expect(result).toEqual({
      text: 'hi from wandb',
      model: 'meta-llama/Llama-3.1-8B-Instruct',
      inputTokens: 11,
      outputTokens: 3,
    });
  });

  it('supports text-style choices from compatible responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ text: 'legacy text response' }],
      }),
    }));

    const result = await adapter.generate(
      ctx(),
      'hello',
      { model: 'deepseek-ai/DeepSeek-V3-0324' },
      { baseUrl: 'https://wandb.test/v1' },
    );

    expect(result).toEqual({
      text: 'legacy text response',
      model: 'deepseek-ai/DeepSeek-V3-0324',
    });
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limit exceeded'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /W&B Inference 429: rate limit exceeded/,
    );
  });
});
