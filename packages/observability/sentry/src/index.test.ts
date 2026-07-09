import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'observability' });

describe('Sentry release API integration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a release and deployment through the Sentry REST API', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/deploys/')) {
        return new Response(JSON.stringify({ environment: 'production' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        version: 'web@1.2.3',
        url: 'https://sentry.io/organizations/acme/releases/web@1.2.3/',
      }), { status: 201, headers: { 'content-type': 'application/json' } });
    });

    const result = await adapter.createRelease({
      secret: (key) => key === 'SENTRY_AUTH_TOKEN' ? 'token_123' : undefined,
      log: () => {},
    }, {
      version: 'web@1.2.3',
      environment: 'production',
    }, {
      org: 'acme',
      project: 'frontend',
    });

    expect(result).toEqual({
      id: 'web@1.2.3',
      url: 'https://sentry.io/organizations/acme/releases/web@1.2.3/',
    });
    expect(calls).toHaveLength(2);
    const [releaseRequest, deployRequest] = calls;
    expect(releaseRequest!.url).toBe('https://sentry.io/api/0/organizations/acme/releases/');
    expect(releaseRequest!.init.method).toBe('POST');
    expect(releaseRequest!.init.headers).toMatchObject({
      Authorization: 'Bearer token_123',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    expect(JSON.parse(releaseRequest!.init.body as string)).toEqual({
      version: 'web@1.2.3',
      projects: ['frontend'],
    });
    expect(deployRequest!.url).toBe('https://sentry.io/api/0/organizations/acme/releases/web%401.2.3/deploys/');
    expect(JSON.parse(deployRequest!.init.body as string)).toEqual({ environment: 'production' });
  });

  it('surfaces Sentry API errors', async () => {
    vi.stubGlobal('fetch', async () => new Response('invalid release', { status: 400 }));

    await expect(adapter.createRelease({
      secret: (key) => key === 'SENTRY_AUTH_TOKEN' ? 'token_123' : undefined,
      log: () => {},
    }, {
      version: 'bad',
    }, {
      org: 'acme',
      project: 'frontend',
    })).rejects.toThrow('invalid release');
  });
});
