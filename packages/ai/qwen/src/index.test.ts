import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (secrets: Record<string, string> = { DASHSCOPE_API_KEY: 'test-dashscope-key' }, dryRun = false) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Qwen DashScope compatible-mode generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx({ DASHSCOPE_API_KEY: 'test-dashscope-key' }, true), 'hello', {}, {});

    expect(result).toEqual({ text: '[dry-run]', model: 'qwen-max' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts compatible-mode requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi from qwen' } }],
        model: 'qwen-plus',
        usage: { prompt_tokens: 9, completion_tokens: 5 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx(), 'hello', {
      model: 'qwen-plus',
      system: 'be brief',
      maxTokens: 40,
      temperature: 0.4,
      extra: { enable_search: true },
    }, { baseUrl: 'https://dashscope.test/' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://dashscope.test/compatible-mode/v1/chat/completions');
    expect(request.headers.authorization).toBe(['Bearer', 'test-dashscope-key'].join(' '));
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({
      model: 'qwen-plus',
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 40,
      temperature: 0.4,
      enable_search: true,
    });
    expect(result).toEqual({
      text: 'hi from qwen',
      model: 'qwen-plus',
      inputTokens: 9,
      outputTokens: 5,
    });
  });

  it('redacts DashScope keys from provider error excerpts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'bad key test-dashscope-key',
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      'DashScope 401: bad key [redacted]',
    );
  });
});
