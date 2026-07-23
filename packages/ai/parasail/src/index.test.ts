import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { PARASAIL_API_KEY: 'test-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Parasail generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes custom base URLs before posting chat completions', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hello from parasail' } }],
        model: 'llama-3.1-8b',
        usage: { prompt_tokens: 8, completion_tokens: 3 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      { system: 'be concise', maxTokens: 32, temperature: 0.2 },
      { baseUrl: 'https://gateway.example.test/v1/' },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://gateway.example.test/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(request.body)).toEqual({
      model: 'llama-3.1-8b',
      messages: [
        { role: 'system', content: 'be concise' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 32,
      temperature: 0.2,
    });
    expect(result).toEqual({
      text: 'hello from parasail',
      model: 'llama-3.1-8b',
      inputTokens: 8,
      outputTokens: 3,
    });
  });

  it('rejects base URLs with credentials, query, or hash', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      adapter.generate(ctx(), 'hello', {}, { baseUrl: 'gateway.example.test/v1' }),
    ).rejects.toThrow('valid URL');
    await expect(
      adapter.generate(ctx(), 'hello', {}, { baseUrl: 'ftp://gateway.example.test/v1' }),
    ).rejects.toThrow('http or https');
    await expect(
      adapter.generate(ctx(), 'hello', {}, { baseUrl: 'https://user:pass@gateway.example.test/v1' }),
    ).rejects.toThrow('clean API base');
    await expect(
      adapter.generate(ctx(), 'hello', {}, { baseUrl: 'https://gateway.example.test/v1?target=chat' }),
    ).rejects.toThrow('clean API base');
    await expect(
      adapter.generate(ctx(), 'hello', {}, { baseUrl: 'https://gateway.example.test/v1#chat' }),
    ).rejects.toThrow('clean API base');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
