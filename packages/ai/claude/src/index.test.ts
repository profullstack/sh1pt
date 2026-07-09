import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { ANTHROPIC_API_KEY: 'test-anthropic-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Claude Messages API generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ ANTHROPIC_API_KEY: 'test-anthropic-key' }, true),
      'hello',
      {},
      {},
    );

    expect(result).toEqual({
      text: '[dry-run]',
      model: 'claude-opus-4-7',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts messages requests and maps text blocks plus usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'claude-sonnet-4-6',
        content: [
          { type: 'text', text: 'hello' },
          { type: 'tool_use', id: 'skip-this-block' },
          { type: 'text', text: ' world' },
        ],
        usage: { input_tokens: 11, output_tokens: 4 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'Draft a short launch note',
      {
        model: 'claude-sonnet-4-6',
        system: 'be concise',
        maxTokens: 64,
        temperature: 0.2,
        extra: { top_p: 0.9 },
      },
      { baseUrl: 'https://anthropic.test' },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://anthropic.test/v1/messages');
    expect(request.headers['x-api-key']).toBe('test-anthropic-key');
    expect(request.headers['anthropic-version']).toBe('2023-06-01');
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({
      model: 'claude-sonnet-4-6',
      max_tokens: 64,
      system: 'be concise',
      temperature: 0.2,
      messages: [{ role: 'user', content: 'Draft a short launch note' }],
      top_p: 0.9,
    });
    expect(result).toEqual({
      text: 'hello world',
      model: 'claude-sonnet-4-6',
      inputTokens: 11,
      outputTokens: 4,
    });
  });

  it('uses a safe default max_tokens value when not provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'claude-opus-4-7',
        content: [{ type: 'text', text: 'done' }],
      }),
    }));

    await adapter.generate(ctx(), 'hello', {}, {});

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const request = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(request.body).max_tokens).toBe(1024);
  });

  it('redacts Anthropic keys from provider error excerpts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid key test-anthropic-key',
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      'Anthropic 401: invalid key [redacted]',
    );
  });
});
