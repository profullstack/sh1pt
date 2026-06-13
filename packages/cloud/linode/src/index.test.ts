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

  it('does not fall back to a default billable type when maxHourlyPrice filters all matches', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
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
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.provision({
      secret: (key: string) => key === 'LINODE_API_TOKEN' ? 'token' : key === 'LINODE_ROOT_PASS' ? 'test-root-pass' : undefined,
      log: vi.fn(),
      dryRun: false,
    }, {
      kind: 'cpu-vps',
      region: 'us-east',
      maxHourlyPrice: 0.001,
    }, {})).rejects.toThrow('satisfies maxHourlyPrice');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.linode.com/v4/linode/types?page_size=500',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('fetches fresh type data for each quote', async () => {
    const fetchMock = vi.fn()
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
          data: [
            {
              id: 'g6-standard-1',
              label: 'Linode 2 GB',
              price: { hourly: 0.015, monthly: 10 },
              vcpus: 1,
              memory: 2048,
              disk: 51200,
              transfer: 2000,
              class: 'standard',
            },
          ],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const ctx = {
      secret: (key: string) => key === 'LINODE_API_TOKEN' ? 'token' : undefined,
      log: vi.fn(),
    };

    await expect(adapter.quote(ctx, { kind: 'cpu-vps', region: 'us-east' }, {})).resolves.toMatchObject({ sku: 'g6-nanode-1' });
    await expect(adapter.quote(ctx, { kind: 'cpu-vps', region: 'us-east' }, {})).resolves.toMatchObject({ sku: 'g6-standard-1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
