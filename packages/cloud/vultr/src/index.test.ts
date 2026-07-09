import { contractTestCloud } from '@profullstack/sh1pt-core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

// Default fetch stub so the shared cloud contract suite (e.g. quote()) stays
// deterministic and never makes a live network call in CI. Individual tests
// below override this with vi.stubGlobal as needed.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
    const target = String(url);
    if (target.endsWith('/plans')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          plans: [
            {
              id: 'vc2-2c-4gb',
              type: 'vc2',
              vcpu_count: 2,
              ram: 4096,
              disk: 80,
              monthly_cost: 20,
              hourly_cost: 0.03,
              locations: ['ewr'],
            },
          ],
          meta: { total: 1, links: { next: '', prev: '' } },
        }),
      };
    }
    return { ok: true, status: 200, text: async () => '{}' };
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Vultr API errors', () => {
  it('reports non-JSON error responses without throwing a parser error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => 'We are currently unavailable',
    }));

    await expect(adapter.quote({
      secret: (key: string) => key === 'VULTR_API_KEY' ? 'test-token' : undefined,
      log: vi.fn(),
    } as any, {
      kind: 'cpu-vps',
      cpu: 2,
      memory: 4,
      region: 'ewr',
    }, {})).rejects.toThrow('Vultr GET /plans failed: 503 We are currently unavailable');
  });
});

contractTestCloud(adapter, {
  sampleConfig: {},
  sampleSpec: { kind: 'cpu-vps', cpu: 2, memory: 4, region: 'ewr' },
  requiredSecrets: ['VULTR_API_KEY'],
});
