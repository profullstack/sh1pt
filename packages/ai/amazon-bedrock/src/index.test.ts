import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'ai' });

const ctx = (
  secrets: Record<string, string> = {
    AWS_BEDROCK_ACCESS_KEY_ID: 'AKIDEXAMPLE',
    AWS_BEDROCK_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  },
  dryRun = false
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  dryRun,
});

describe('Amazon Bedrock Converse generation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T18:00:00.000Z'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('short-circuits dry-run before signing or network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(undefined, true),
      'hello',
      {},
      {}
    );

    expect(result).toEqual({
      text: '[dry-run]',
      model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires both AWS Bedrock credential parts', async () => {
    await expect(adapter.generate(
      ctx({ AWS_BEDROCK_ACCESS_KEY_ID: 'AKIDEXAMPLE' }),
      'hello',
      {},
      {}
    )).rejects.toThrow(/AWS_BEDROCK_SECRET_ACCESS_KEY not in vault/);
  });

  it('posts signed Converse requests and maps text plus usage tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: {
          message: {
            role: 'assistant',
            content: [
              { text: 'hello ' },
              { text: 'from bedrock' },
            ],
          },
        },
        trace: { promptRouter: { invokedModelId: 'amazon.nova-lite-v1:0' } },
        usage: { inputTokens: 11, outputTokens: 5, totalTokens: 16 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.generate(
      ctx(),
      'hello',
      {
        model: 'amazon.nova-lite-v1:0',
        system: 'be concise',
        maxTokens: 128,
        temperature: 0.2,
        extra: {
          additionalModelRequestFields: { top_k: 20 },
          requestMetadata: { source: 'sh1pt-test' },
        },
      },
      { region: 'eu-west-1' }
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://bedrock-runtime.eu-west-1.amazonaws.com/model/amazon.nova-lite-v1%3A0/converse');
    expect(request.method).toBe('POST');
    expect(request.headers['content-type']).toBe('application/json');
    expect(request.headers.host).toBe('bedrock-runtime.eu-west-1.amazonaws.com');
    expect(request.headers['x-amz-date']).toBe('20260520T180000Z');
    expect(request.headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260520\/eu-west-1\/bedrock\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/
    );

    const body = JSON.parse(request.body);
    expect(body).toEqual({
      messages: [
        {
          role: 'user',
          content: [{ text: 'hello' }],
        },
      ],
      system: [{ text: 'be concise' }],
      additionalModelRequestFields: { top_k: 20 },
      requestMetadata: { source: 'sh1pt-test' },
      inferenceConfig: {
        maxTokens: 128,
        temperature: 0.2,
      },
    });
    expect(request.headers['x-amz-content-sha256']).toBe(
      createHash('sha256').update(request.body).digest('hex')
    );
    expect(result).toEqual({
      text: 'hello from bedrock',
      model: 'amazon.nova-lite-v1:0',
      inputTokens: 11,
      outputTokens: 5,
    });
  });

  it('supports temporary credentials and custom Bedrock Runtime base URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: { message: { content: [{ text: 'ok' }] } },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await adapter.generate(
      ctx({
        AWS_BEDROCK_ACCESS_KEY_ID: 'AKIDEXAMPLE',
        AWS_BEDROCK_SECRET_ACCESS_KEY: 'test-secret',
        AWS_BEDROCK_SESSION_TOKEN: 'session-token',
      }),
      'ping',
      {
        extra: {
          inferenceConfig: { topP: 0.8 },
        },
      },
      { baseUrl: 'https://bedrock-runtime.test', region: 'us-west-2' }
    );

    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://bedrock-runtime.test/model/anthropic.claude-3-5-sonnet-20241022-v2%3A0/converse');
    expect(request.headers['x-amz-security-token']).toBe('session-token');
    expect(request.headers.authorization).toContain(
      'SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token'
    );
    expect(JSON.parse(request.body).inferenceConfig).toEqual({ topP: 0.8 });
  });

  it('includes status and response body excerpts on errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'AccessDeniedException: denied'.repeat(20),
    }));

    await expect(adapter.generate(ctx(), 'hello', {}, {})).rejects.toThrow(
      /Amazon Bedrock 403: AccessDeniedException: denied/
    );
  });
});
