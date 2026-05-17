import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { AZURE_OPENAI_API_KEY: 'test-key' },
  dryRun = false
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Azure OpenAI chat completions generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ AZURE_OPENAI_API_KEY: 'test-key' }, true),
      'hello',
      {},
      {}
    );

    expect(result).toEqual({ text: '[dry-run]', model: 'gpt-4o' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts deployment chat completions requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi from azure' } }],
        model: 'gpt-4o',
        usage: { prompt_tokens: 12, completion_tokens: 5 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        system: 'be useful',
        maxTokens: 120,
        temperature: 0.2,
        extra: { top_p: 0.9 },
      },
      {
        endpoint: 'https://example-resource.openai.azure.com',
        deployment: 'gpt-4o-prod',
        apiVersion: '2025-04-01-preview',
      }
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe(
      'https://example-resource.openai.azure.com/openai/deployments/gpt-4o-prod/chat/completions?api-version=2025-04-01-preview'
    );
    expect(request.headers['api-key']).toBe('test-key');
    expect(JSON.parse(request.body)).toEqual({
      messages: [
        { role: 'system', content: 'be useful' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 120,
      temperature: 0.2,
      top_p: 0.9,
    });
    expect(result).toEqual({
      text: 'hi from azure',
      model: 'gpt-4o',
      inputTokens: 12,
      outputTokens: 5,
    });
  });

  it('uses the requested model as deployment when config does not override it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx(), 'hello', { model: 'gpt-4o-mini' }, {
      endpoint: 'https://example-resource.openai.azure.com/',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example-resource.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-06-01',
      expect.any(Object)
    );
    expect(result.model).toBe('gpt-4o-mini');
  });

  it('accepts baseUrl as an endpoint alias', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await adapter.generate(ctx(), 'hello', {}, {
      baseUrl: 'https://example-resource.openai.azure.com',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example-resource.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-06-01',
      expect.any(Object)
    );
  });

  it('requires an endpoint for live requests', async () => {
    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /Azure OpenAI endpoint config required/
    );
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'deployment not found'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {
      endpoint: 'https://example-resource.openai.azure.com',
    })).rejects.toThrow(/Azure OpenAI 404: deployment not found/);
  });
});
