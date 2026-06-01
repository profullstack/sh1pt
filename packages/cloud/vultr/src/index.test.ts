import { contractTestCloud } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

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
