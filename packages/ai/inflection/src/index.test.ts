import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { INFLECTION_API_KEY: 'test-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Inflection generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires an Inflection API key', async () => {
    await expect(adapter.generate(ctx({}, false), 'hello', {}, {}))
      .rejects.toThrow('INFLECTION_API_KEY');
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx({ INFLECTION_API_KEY: 'test-key' }, true), 'hello', {}, {});

    expect(result).toEqual({ text: '[dry-run]', model: 'inflection_3_productivity' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts Inflection context requests and maps token usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: 'A crisp launch blurb.',
        model: 'inflection_3_productivity',
        usage: { input_tokens: 19, output_tokens: 7 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'Draft a launch blurb.',
      {
        system: 'Answer tersely.',
        maxTokens: 80,
        temperature: 0.2,
        extra: { response_format: { type: 'json_object' } },
      },
      { workspaceId: 'workspace-test' },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe('https://api.inflection.ai/external/api/inference');
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(request.body)).toEqual({
      config: 'inflection_3_productivity',
      context: [
        { type: 'Instruction', text: 'Answer tersely.' },
        { type: 'Human', text: 'Draft a launch blurb.' },
      ],
      max_tokens: 80,
      temperature: 0.2,
      workspace_id: 'workspace-test',
      response_format: { type: 'json_object' },
    });
    expect(result).toEqual({
      text: 'A crisp launch blurb.',
      model: 'inflection_3_productivity',
      inputTokens: 19,
      outputTokens: 7,
    });
  });

  it('does not duplicate an existing Bearer prefix', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output: 'ok' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await adapter.generate(ctx({ INFLECTION_API_KEY: 'Bearer supplied' }), 'hello', {}, {});

    expect(fetchMock.mock.calls[0]?.[1].headers.authorization).toBe('Bearer supplied');
  });

  it('uses model overrides and OpenAI-compatible response fallbacks', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Pi-toned answer' } }],
        usage: { prompt_tokens: 12, completion_tokens: 4 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(ctx(), 'hello', { model: 'inflection_3_pi' }, {});

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).config).toBe('inflection_3_pi');
    expect(result).toEqual({
      text: 'Pi-toned answer',
      model: 'inflection_3_pi',
      inputTokens: 12,
      outputTokens: 4,
    });
  });

  it('uses custom base URLs without duplicate inference paths', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { text: 'custom' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await adapter.generate(ctx(), 'hello', {}, { baseUrl: 'https://proxy.example.test/external/api/' });
    await adapter.generate(ctx(), 'hello', {}, { baseUrl: 'https://proxy.example.test/external/api/inference' });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://proxy.example.test/external/api/inference');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://proxy.example.test/external/api/inference');
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'cloudflare or auth gate'.repeat(20),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(/Inflection 403: cloudflare or auth gate/);
  });

  it('fails clearly when a response has no generated text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ usage: { input_tokens: 1 } }),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow('generated text');
  });
});
