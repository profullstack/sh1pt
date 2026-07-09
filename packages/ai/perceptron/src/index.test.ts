import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { PERCEPTRON_API_KEY: 'test-key' },
  dryRun = false
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Perceptron chat completions generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ PERCEPTRON_API_KEY: 'test-key' }, true),
      'hello',
      {},
      {}
    );

    expect(result).toEqual({ text: '[dry-run]', model: 'perceptron-mk1' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi from perceptron' } }],
        model: 'isaac-0.2-2b-preview',
        usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        model: 'isaac-0.2-2b-preview',
        system: '<hint>THINK</hint>',
        maxTokens: 64,
        temperature: 0.2,
        extra: {
          top_p: 0.9,
          response_format: { type: 'text' },
        },
      },
      {}
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.perceptron.inc/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({
      model: 'isaac-0.2-2b-preview',
      messages: [
        { role: 'system', content: '<hint>THINK</hint>' },
        { role: 'user', content: 'hello' },
      ],
      stream: false,
      max_completion_tokens: 64,
      temperature: 0.2,
      top_p: 0.9,
      response_format: { type: 'text' },
    });
    expect(result).toEqual({
      text: 'hi from perceptron',
      model: 'isaac-0.2-2b-preview',
      inputTokens: 9,
      outputTokens: 4,
    });
  });

  it('uses a configured base URL and Perceptron-specific vision options', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'grounded answer' } }],
        model: 'perceptron-mk1',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await adapter.generate(
      ctx(),
      'describe the image',
      {
        extra: {
          vision_config: {
            enable_thinking: true,
            annotation_format: 'box',
          },
        },
      },
      { baseUrl: 'https://perceptron.test/v1' }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://perceptron.test/v1/chat/completions',
      expect.objectContaining({
        body: JSON.stringify({
          model: 'perceptron-mk1',
          messages: [{ role: 'user', content: 'describe the image' }],
          stream: false,
          vision_config: {
            enable_thinking: true,
            annotation_format: 'box',
          },
        }),
      })
    );
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /Perceptron 429: rate limited/
    );
  });
});
