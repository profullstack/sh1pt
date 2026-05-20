import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { CLARIFAI_PAT: 'test-pat' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Clarifai generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ CLARIFAI_PAT: 'test-pat' }, true),
      'hello',
      {},
      {},
    );

    expect(result).toEqual({
      text: '[dry-run]',
      model: 'https://clarifai.com/openai/chat-completion/models/gpt-oss-120b',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts OpenAI-compatible chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'openai/chat-completion/models/gpt-oss-120b',
        choices: [{ message: { role: 'assistant', content: 'hi from clarifai' } }],
        usage: { prompt_tokens: 9, completion_tokens: 5, total_tokens: 14 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        model: 'openai/chat-completion/models/gpt-oss-120b',
        system: 'be concise',
        maxTokens: 64,
        temperature: 0.2,
        extra: { top_p: 0.9, seed: 7 },
      },
      {},
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.clarifai.com/v2/ext/openai/v1/chat/completions');
    expect(request.headers.authorization).toBe('Key test-pat');
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({
      model: 'openai/chat-completion/models/gpt-oss-120b',
      messages: [
        { role: 'system', content: 'be concise' },
        { role: 'user', content: 'hello' },
      ],
      stream: false,
      max_completion_tokens: 64,
      temperature: 0.2,
      top_p: 0.9,
      seed: 7,
    });
    expect(result).toEqual({
      text: 'hi from clarifai',
      model: 'openai/chat-completion/models/gpt-oss-120b',
      inputTokens: 9,
      outputTokens: 5,
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
      { model: 'anthropic/completion/models/claude-sonnet-4' },
      { baseUrl: 'https://clarifai.test/v2/ext/openai/v1' },
    );

    expect(result).toEqual({
      text: 'legacy text response',
      model: 'anthropic/completion/models/claude-sonnet-4',
    });
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid pat'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /Clarifai 401: invalid pat/,
    );
  });
});
