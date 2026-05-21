import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (secrets: Record<string, string> = { GMI_API_KEY: 'test-gmi-key' }, dryRun = false) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('GMICloud chat completions generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx({ GMI_API_KEY: 'test-gmi-key' }, true), 'hello', {}, {});

    expect(result).toEqual({ text: '[dry-run]', model: 'deepseek-ai/DeepSeek-R1' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi from gmi' } }],
        model: 'deepseek-ai/DeepSeek-R1',
        usage: { prompt_tokens: 10, completion_tokens: 6 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx(), 'hello', {
      system: 'be brief',
      maxTokens: 24,
      temperature: 0.2,
      extra: { top_p: 0.7 },
    }, { baseUrl: 'https://gmi.test/' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://gmi.test/v1/chat/completions');
    expect(request.headers.authorization).toBe(['Bearer', 'test-gmi-key'].join(' '));
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({
      model: 'deepseek-ai/DeepSeek-R1',
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 24,
      temperature: 0.2,
      top_p: 0.7,
    });
    expect(result).toEqual({
      text: 'hi from gmi',
      model: 'deepseek-ai/DeepSeek-R1',
      inputTokens: 10,
      outputTokens: 6,
    });
  });

  it('redacts GMICloud keys from provider error excerpts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'bad key test-gmi-key',
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      'GMICloud 403: bad key [redacted]',
    );
  });
});
