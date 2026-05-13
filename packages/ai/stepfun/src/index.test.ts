import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { STEPFUN_API_KEY: 'test-key' },
  dryRun = false
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('StepFun OpenAI-compatible generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ STEPFUN_API_KEY: 'test-key' }, true),
      'hello',
      {},
      {}
    );

    expect(result).toEqual({ text: '[dry-run]', model: 'step-3.5-flash' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi from stepfun' } }],
        model: 'step-3.5-flash-2603',
        usage: { prompt_tokens: 18, completion_tokens: 10 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        model: 'step-3.5-flash-2603',
        system: 'be practical',
        maxTokens: 100,
        temperature: 0.5,
        extra: { reasoning_format: { type: 'deepseek-style' } },
      },
      {}
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.stepfun.ai/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(request.body)).toEqual({
      model: 'step-3.5-flash-2603',
      messages: [
        { role: 'system', content: 'be practical' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 100,
      temperature: 0.5,
      reasoning_format: { type: 'deepseek-style' },
    });
    expect(result).toEqual({
      text: 'hi from stepfun',
      model: 'step-3.5-flash-2603',
      inputTokens: 18,
      outputTokens: 10,
    });
  });

  it('uses a configured Step Plan base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
        model: 'step-3.5-flash',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await adapter.generate(ctx(), 'hello', {}, {
      baseUrl: 'https://api.stepfun.ai/step_plan/v1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.stepfun.ai/step_plan/v1/chat/completions',
      expect.any(Object)
    );
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'forbidden'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /StepFun 403: forbidden/
    );
  });
});
