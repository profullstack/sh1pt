import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = { GOOGLE_VERTEX_API_KEY: 'test-key' },
  dryRun = false,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Google Vertex AI generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('short-circuits dry-run before network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx({ GOOGLE_VERTEX_API_KEY: 'test-key' }, true),
      'hello',
      {},
      {},
    );

    expect(result).toEqual({
      text: '[dry-run]',
      model: 'gemini-1.5-pro',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts express-mode generateContent requests and maps usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'hello ' }, { text: 'from vertex' }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 8,
          candidatesTokenCount: 5,
          totalTokenCount: 13,
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        model: 'gemini-2.5-flash',
        system: 'be concise',
        maxTokens: 80,
        temperature: 0.2,
        extra: { safetySettings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }] },
      },
      {},
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, request] = call!;
    expect(url).toBe(
      'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent?key=test-key',
    );
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      systemInstruction: { parts: [{ text: 'be concise' }] },
      generationConfig: {
        maxOutputTokens: 80,
        temperature: 0.2,
      },
      safetySettings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }],
    });
    expect(result).toEqual({
      text: 'hello from vertex',
      model: 'gemini-2.5-flash',
      inputTokens: 8,
      outputTokens: 5,
    });
  });

  it('supports standard project/location model paths and custom base URLs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'standard path' }] } }] }),
    }));

    const result = await adapter.generate(
      ctx({ GOOGLE_VERTEX_API_KEY: 'a key with spaces' }),
      'hello',
      { model: 'gemini-2.0-flash' },
      {
        baseUrl: 'https://europe-west4-aiplatform.googleapis.com/v1/',
        project: 'test-project',
        location: 'europe-west4',
      },
    );

    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(
      'https://europe-west4-aiplatform.googleapis.com/v1/projects/test-project/locations/europe-west4/publishers/google/models/gemini-2.0-flash:generateContent?key=a%20key%20with%20spaces',
    );
    expect(result).toEqual({
      text: 'standard path',
      model: 'gemini-2.0-flash',
    });
  });

  it('passes through fully qualified model paths', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'qualified' }] } }] }),
    }));

    await adapter.generate(
      ctx(),
      'hello',
      { model: 'publishers/google/models/gemini-1.5-pro' },
      {},
    );

    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(
      'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-1.5-pro:generateContent?key=test-key',
    );
  });

  it('includes status and response body excerpt on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'api key rejected'.repeat(30),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /Google Vertex AI 403: api key rejected/,
    );
  });
});
