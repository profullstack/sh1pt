import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { RELACE_API_KEY: 'test-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Relace Apply generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a Relace API key', async () => {
    await expect(adapter.generate(ctx({}, false), 'hello', {}, {}))
      .rejects.toThrow('RELACE_API_KEY');
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx({ RELACE_API_KEY: 'test-key' }, true), 'hello', {}, {});

    expect(result).toEqual({ text: '[dry-run]', model: 'relace-apply-3' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts apply requests and maps token usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        mergedCode: 'const total = price - discount;',
        usage: { prompt_tokens: 17, completion_tokens: 9 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'replace subtraction',
      {
        system: 'Apply the edit exactly.',
        extra: {
          initialCode: 'const total = price + discount;',
          editSnippet: 'const total = price - discount;',
          relace_metadata: { source: 'test' },
        },
      },
      {},
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://instantapply.endpoint.relace.run/v1/code/apply');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(request.body)).toEqual({
      model: 'relace-apply-3',
      initial_code: 'const total = price + discount;',
      edit_snippet: 'const total = price - discount;',
      stream: false,
      instruction: 'Apply the edit exactly.',
      relace_metadata: { source: 'test' },
    });
    expect(result).toEqual({
      text: 'const total = price - discount;',
      model: 'relace-apply-3',
      inputTokens: 17,
      outputTokens: 9,
    });
  });

  it('parses the documented tagged prompt format', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        mergedCode: 'function greet(name) { return `Hi ${name}`; }',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await adapter.generate(
      ctx(),
      [
        '<instruction>Keep the function signature.</instruction>',
        '<code>function greet(name) { return name; }</code>',
        '<update>return `Hi ${name}`;</update>',
      ].join('\n'),
      {},
      {},
    );

    const request = fetchMock.mock.calls[0]?.[1];
    expect(request).toBeDefined();
    expect(JSON.parse(request!.body)).toEqual({
      model: 'relace-apply-3',
      initial_code: 'function greet(name) { return name; }',
      edit_snippet: 'return `Hi ${name}`;',
      stream: false,
      instruction: 'Keep the function signature.',
    });
  });

  it('uses custom base URLs without duplicate slashes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ mergedCode: 'custom' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await adapter.generate(ctx(), 'hello', {}, { baseUrl: 'https://proxy.example.test/' });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://proxy.example.test/v1/code/apply');
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limit'.repeat(40),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(/Relace 429: rate limit/);
  });
});
