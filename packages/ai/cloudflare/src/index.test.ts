import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { CLOUDFLARE_API_TOKEN: 'test-token' },
  dryRun = false
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Cloudflare Workers AI generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ CLOUDFLARE_API_TOKEN: 'test-token' }, true),
      'hello',
      {},
      {}
    );

    expect(result).toEqual({
      text: '[dry-run]',
      model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts Workers AI run requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          response: 'hi from cloudflare',
          usage: { prompt_tokens: 25, completion_tokens: 8 },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        model: '@cf/meta/llama-3.1-8b-instruct',
        system: 'be brief',
        maxTokens: 50,
        temperature: 0.4,
        extra: { top_p: 0.8 },
      },
      { accountId: 'acct_123' }
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acct_123/ai/run/@cf/meta/llama-3.1-8b-instruct'
    );
    expect(request.headers.authorization).toBe('Bearer test-token');
    expect(JSON.parse(request.body)).toEqual({
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hello' },
      ],
      max_tokens: 50,
      temperature: 0.4,
      top_p: 0.8,
    });
    expect(result).toEqual({
      text: 'hi from cloudflare',
      model: '@cf/meta/llama-3.1-8b-instruct',
      inputTokens: 25,
      outputTokens: 8,
    });
  });

  it('requires an account ID for live requests', async () => {
    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /Cloudflare accountId config required/
    );
  });

  it('uses a configured base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: { response: 'ok' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await adapter.generate(ctx(), 'hello', {}, {
      accountId: 'acct_123',
      baseUrl: 'https://cloudflare.example/client/v4/',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://cloudflare.example/client/v4/accounts/acct_123/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      expect.any(Object)
    );
  });

  it('includes status and response body excerpt on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'forbidden'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, { accountId: 'acct_123' })).rejects.toThrow(
      /Cloudflare Workers AI 403: forbidden/
    );
  });

  it('surfaces Cloudflare API error messages from successful HTTP responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: false,
        errors: [{ message: 'model not enabled' }],
      }),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, { accountId: 'acct_123' })).rejects.toThrow(
      /Cloudflare Workers AI: model not enabled/
    );
  });
});
