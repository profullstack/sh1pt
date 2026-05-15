import { contractTestCaptcha } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import captcha from './index.js';

contractTestCaptcha(captcha, {
  sampleConfig: {},
  requiredSecrets: ['TWOCAPTCHA_API_KEY'],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('2Captcha API integration', () => {
  it('returns balance during connect', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ status: 1, request: '12.34' }));

    await expect(captcha.connect(ctx(), {})).resolves.toEqual({
      accountId: '2captcha',
      balanceUsd: 12.34,
    });
  });

  it('creates and polls a recaptcha task', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ status: 1, request: 'task_123' }))
      .mockResolvedValueOnce(jsonResponse({ status: 0, request: 'CAPCHA_NOT_READY' }))
      .mockResolvedValueOnce(jsonResponse({ status: 1, request: 'token_abc' }));

    const result = await captcha.solve(ctx(), {
      kind: 'recaptcha-v2',
      pageUrl: 'https://example.com/signup',
      siteKey: 'site_key',
    }, {
      pollIntervalMs: 1,
      timeoutMs: 100,
    });

    expect(result).toMatchObject({
      token: 'token_abc',
      kind: 'recaptcha-v2',
    });

    const createRequest = fetchMock.mock.calls[0]!;
    expect(createRequest[0]).toBe('https://api.2captcha.com/in.php');
    const createBody = new URLSearchParams(String((createRequest[1] as RequestInit).body));
    expect(Object.fromEntries(createBody)).toMatchObject({
      key: 'captcha-key',
      json: '1',
      method: 'userrecaptcha',
      googlekey: 'site_key',
      pageurl: 'https://example.com/signup',
    });
    expect(String(fetchMock.mock.calls[2]![0])).toContain('action=get');
    expect(String(fetchMock.mock.calls[2]![0])).toContain('id=task_123');
  });

  it('maps challenge-specific parameters', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ status: 1, request: 'task_123' }))
      .mockResolvedValueOnce(jsonResponse({ status: 1, request: 'token_abc' }));

    await captcha.solve(ctx(), {
      kind: 'recaptcha-v3',
      pageUrl: 'https://example.com/signup',
      siteKey: 'site_key',
      action: 'signup',
    }, {
      pollIntervalMs: 1,
      timeoutMs: 100,
    });

    const body = new URLSearchParams(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
    expect(Object.fromEntries(body)).toMatchObject({
      method: 'userrecaptcha',
      version: 'v3',
      action: 'signup',
    });
  });

  it('requires site keys for site-key challenges', async () => {
    await expect(captcha.solve(ctx(), {
      kind: 'hcaptcha',
      pageUrl: 'https://example.com/signup',
    }, {})).rejects.toThrow('requires challenge.siteKey');
  });

  it('reads balance with an explicit config API key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ status: 1, request: '3.21' }));

    await expect(captcha.balance?.({ apiKey: 'explicit-key' })).resolves.toEqual({
      amount: 3.21,
      currency: 'USD',
    });
  });
});

function ctx() {
  return {
    secret: (key: string) => key === 'TWOCAPTCHA_API_KEY' ? 'captcha-key' : undefined,
    log: () => {},
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
