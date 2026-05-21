import { contractTestCaptcha } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import captcha from './index.js';

contractTestCaptcha(captcha, {
  sampleConfig: {},
  requiredSecrets: ['TWOCAPTCHA_API_KEY'],
});

const ctx = (
  secrets: Record<string, string> = { TWOCAPTCHA_API_KEY: 'test-key' },
  signal?: AbortSignal,
) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
  signal,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('2Captcha API v2 adapter', () => {
  it('uses the registry id documented by the CLI and README', () => {
    expect(captcha.id).toBe('captcha-2captcha');
  });

  it('checks account balance during connect', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ errorId: 0, balance: 1.2345 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(captcha.connect(ctx(), { baseUrl: 'https://2captcha.test' })).resolves.toEqual({
      accountId: '2captcha',
      balanceUsd: 1.2345,
    });

    expect(fetchMock).toHaveBeenCalledWith('https://2captcha.test/getBalance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientKey: 'test-key' }),
    });
  });

  it('creates and polls a reCAPTCHA v2 task', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ errorId: 0, taskId: 12345 }))
      .mockResolvedValueOnce(response({ errorId: 0, status: 'processing' }))
      .mockResolvedValueOnce(response({
        errorId: 0,
        status: 'ready',
        solution: { gRecaptchaResponse: 'captcha-token' },
        cost: '0.00299',
        createTime: 100,
        endTime: 112,
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await captcha.solve(ctx(), {
      kind: 'recaptcha-v2',
      pageUrl: 'https://example.com/login',
      siteKey: 'site-key',
    }, {
      baseUrl: 'https://2captcha.test',
      pollIntervalMs: 0,
      timeoutMs: 500,
      languagePool: 'en',
      softId: 42,
    });

    expect(result).toEqual({
      token: 'captcha-token',
      kind: 'recaptcha-v2',
      solvedInMs: 12_000,
      cost: 0.00299,
    });

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      clientKey: 'test-key',
      task: {
        type: 'RecaptchaV2TaskProxyless',
        websiteURL: 'https://example.com/login',
        websiteKey: 'site-key',
      },
      languagePool: 'en',
      softId: 42,
    });
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({
      clientKey: 'test-key',
      taskId: 12345,
    });
  });

  it('maps Turnstile and reCAPTCHA v3 task options', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ errorId: 0, taskId: 1 }))
      .mockResolvedValueOnce(response({ errorId: 0, status: 'ready', solution: { token: 'turnstile-token' } }))
      .mockResolvedValueOnce(response({ errorId: 0, taskId: 2 }))
      .mockResolvedValueOnce(response({ errorId: 0, status: 'ready', solution: { gRecaptchaResponse: 'v3-token' } }));
    vi.stubGlobal('fetch', fetchMock);

    await captcha.solve(ctx(), {
      kind: 'turnstile',
      pageUrl: 'https://example.com',
      siteKey: 'turnstile-key',
      action: 'managed',
    }, { baseUrl: 'https://2captcha.test', pollIntervalMs: 0 });
    await captcha.solve(ctx(), {
      kind: 'recaptcha-v3',
      pageUrl: 'https://example.com',
      siteKey: 'recaptcha-key',
      action: 'checkout',
    }, { baseUrl: 'https://2captcha.test', pollIntervalMs: 0, recaptchaV3MinScore: 0.7 });

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string).task).toEqual({
      type: 'TurnstileTaskProxyless',
      websiteURL: 'https://example.com',
      websiteKey: 'turnstile-key',
      action: 'managed',
    });
    expect(JSON.parse(fetchMock.mock.calls[2]?.[1]?.body as string).task).toEqual({
      type: 'RecaptchaV3TaskProxyless',
      websiteURL: 'https://example.com',
      websiteKey: 'recaptcha-key',
      pageAction: 'checkout',
      minScore: 0.7,
    });
  });

  it('encodes data-url image captchas as ImageToTextTask', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ errorId: 0, taskId: 123 }))
      .mockResolvedValueOnce(response({ errorId: 0, status: 'ready', solution: { text: 'ABCD' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(captcha.solve(ctx(), {
      kind: 'text-image',
      pageUrl: 'https://example.com/captcha',
      imageUrl: 'data:image/png;base64,aW1hZ2U=',
      instruction: 'type the text',
    }, { baseUrl: 'https://2captcha.test', pollIntervalMs: 0 })).resolves.toMatchObject({
      token: 'ABCD',
      kind: 'text-image',
    });

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string).task).toEqual({
      type: 'ImageToTextTask',
      body: 'aW1hZ2U=',
      comment: 'type the text',
    });
  });

  it('surfaces 2Captcha API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      errorId: 12,
      errorCode: 'ERROR_CAPTCHA_UNSOLVABLE',
      errorDescription: 'Workers could not solve the Captcha',
    })));

    await expect(captcha.solve(ctx(), {
      kind: 'hcaptcha',
      pageUrl: 'https://example.com',
      siteKey: 'site-key',
    }, { baseUrl: 'https://2captcha.test', pollIntervalMs: 0 })).rejects.toThrow(
      /ERROR_CAPTCHA_UNSOLVABLE/,
    );
  });

  it('redacts the API key from HTTP error excerpts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(
      { error: 'bad key test-key' },
      false,
      500,
    )));

    await expect(captcha.connect(ctx(), { baseUrl: 'https://2captcha.test' })).rejects.toThrow(
      /bad key \[redacted\]/,
    );
  });
});

function response(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}
