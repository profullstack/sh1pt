import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'promo' });

describe('PostHog experiment API integration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates an experiment via the PostHog REST API', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: 42, name: 'My App' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    });

    const result = await adapter.start(
      {
        projectDir: '/tmp',
        appName: 'My App',
        storeUrls: {},
        budget: { amount: 0, currency: 'USD', cadence: 'daily' },
        start: new Date(),
        objective: 'awareness',
        creatives: [{ headline: 'Hello', description: 'World' }],
        secret: (k) => (k === 'POSTHOG_PERSONAL_API_KEY' ? 'phx_secret' : undefined),
        log: () => {},
        dryRun: false,
      },
      { projectApiKey: 'ph_proj', personalApiKey: 'phx_secret', projectId: '99' },
    );

    expect(result.id).toBe('42');
    expect(result.url).toContain('/experiments/42');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('/api/projects/99/experiments/');
    expect(calls[0]!.init.method).toBe('POST');
  });

  it('returns dry-run result without hitting the API', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('should not call fetch in dry-run');
    });

    const result = await adapter.start(
      {
        projectDir: '/tmp',
        appName: 'My App',
        storeUrls: {},
        budget: { amount: 0, currency: 'USD', cadence: 'daily' },
        start: new Date(),
        objective: 'awareness',
        creatives: [],
        secret: (k) => (k === 'POSTHOG_PERSONAL_API_KEY' ? 'phx_secret' : undefined),
        log: () => {},
        dryRun: true,
      },
      { projectApiKey: 'ph_proj', projectId: '99' },
    );

    expect(result.id).toBe('dry-run');
  });

  it('throws when projectId is missing', async () => {
    await expect(
      adapter.start(
        {
          projectDir: '/tmp',
          appName: 'My App',
          storeUrls: {},
          budget: { amount: 0, currency: 'USD', cadence: 'daily' },
          start: new Date(),
          objective: 'awareness',
          creatives: [],
          secret: (k) => (k === 'POSTHOG_PERSONAL_API_KEY' ? 'phx_secret' : undefined),
          log: () => {},
          dryRun: false,
        },
        { projectApiKey: 'ph_proj' },
      ),
    ).rejects.toThrow('projectId required');
  });
});
