import { contractTestCloud } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Linode cloud adapter', () => {
  it('connects from the direct account response shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ euuid: 'acct-123', email: 'ops@example.com' }),
    }));

    await expect(adapter.connect({
      secret: (key: string) => key === 'LINODE_API_TOKEN' ? 'token' : undefined,
      log: vi.fn(),
    }, {})).resolves.toEqual({ accountId: 'acct-123' });
  });

  it('creates instances from direct create response shape', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          data: [
            {
              id: 'g6-nanode-1',
              label: 'Nanode 1 GB',
              price: { hourly: 0.0075, monthly: 5 },
              vcpus: 1,
              memory: 1024,
              disk: 25600,
              transfer: 1000,
              class: 'nanode',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: 123,
          label: 'sh1pt-cpu-vps-test',
          status: 'running',
          type: 'g6-nanode-1',
          ipv4: ['203.0.113.10'],
          region: 'us-east',
          created: '2026-06-13T00:00:00',
          tags: ['sh1pt'],
        }),
      }));

    await expect(adapter.provision({
      secret: (key: string) => key === 'LINODE_API_TOKEN' ? 'token' : key === 'LINODE_ROOT_PASS' ? 'test-root-pass' : undefined,
      log: vi.fn(),
      dryRun: false,
    }, {
      kind: 'cpu-vps',
      cpu: 1,
      memory: 1,
      region: 'us-east',
      tags: ['sh1pt'],
    }, {})).resolves.toMatchObject({
      id: '123',
      kind: 'cpu-vps',
      status: 'running',
      publicIp: '203.0.113.10',
      sku: 'g6-nanode-1',
    });
  });

  it('requires a login mechanism before non-dry-run image provisioning', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: [
          {
            id: 'g6-nanode-1',
            label: 'Nanode 1 GB',
            price: { hourly: 0.0075, monthly: 5 },
            vcpus: 1,
            memory: 1024,
            disk: 25600,
            transfer: 1000,
            class: 'nanode',
          },
        ],
      }),
    }));

    await expect(adapter.provision({
      secret: (key: string) => key === 'LINODE_API_TOKEN' ? 'token' : undefined,
      log: vi.fn(),
      dryRun: false,
    }, { kind: 'cpu-vps', region: 'us-east' }, {})).rejects.toThrow('linode image deploy requires');
  });

  it('reports non-JSON API errors without parser noise', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => 'temporarily unavailable',
    }));

    await expect(adapter.connect({
      secret: (key: string) => key === 'LINODE_API_TOKEN' ? 'token' : undefined,
      log: vi.fn(),
    }, {})).rejects.toThrow('Linode GET /account failed: 503 temporarily unavailable');
  });
});

contractTestCloud(adapter, {
  sampleConfig: {},
  sampleSpec: { kind: 'cpu-vps', cpu: 1, memory: 1, region: 'us-east' },
  requiredSecrets: ['LINODE_API_TOKEN'],
});
