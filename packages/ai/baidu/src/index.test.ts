import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { QIANFAN_API_KEY: 'test-token' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Baidu Qianfan chat completions generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ QIANFAN_API_KEY: 'test-token' }, true),
      'hello',
      {},
      {},
    );

    expect(result).toEqual({
      text: '[dry-run]',
      model: 'ernie-4.0-turbo-8k',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts OpenAI-compatible chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'ernie-4.0-turbo-8k',
        choices: [{ message: { role: 'assistant', content: 'hi from qianfan' } }],
        usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        model: 'ernie-4.0-turbo-8k',
        system: 'be concise',
        maxTokens: 80,
        temperature: 0.3,
        extra: { top_p: 0.8, penalty_score: 1.1 },
      },
      { appId: 'app-test' },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://qianfan.baidubce.com/v2/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-token');
    expect(request.headers['content-type']).toBe('application/json');
    expect(request.headers.appid).toBe('app-test');
    expect(JSON.parse(request.body)).toEqual({
      model: 'ernie-4.0-turbo-8k',
      messages: [
        { role: 'system', content: 'be concise' },
        { role: 'user', content: 'hello' },
      ],
      stream: false,
      max_tokens: 80,
      temperature: 0.3,
      top_p: 0.8,
      penalty_score: 1.1,
    });
    expect(result).toEqual({
      text: 'hi from qianfan',
      model: 'ernie-4.0-turbo-8k',
      inputTokens: 11,
      outputTokens: 7,
    });
  });

  it('supports compatible text-style choices and custom base URLs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ text: 'legacy text response' }],
      }),
    }));

    const result = await adapter.generate(
      ctx(),
      'hello',
      { model: 'deepseek-v3.1-250821' },
      { baseUrl: 'https://qianfan.test/v2' },
    );

    expect(result).toEqual({
      text: 'legacy text response',
      model: 'deepseek-v3.1-250821',
    });
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid bearer token'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /Baidu Qianfan 401: invalid bearer token/,
    );
  });
});
