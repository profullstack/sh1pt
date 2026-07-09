import { contractTestCloud } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

afterEach(() => {
  vi.restoreAllMocks();
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
      hourlyRate: 0.0075,
    });
  });

  it('uses a Linode-valid short label when creating block storage volumes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        id: 456,
        label: 'sh1pt-bs-test',
        status: 'active',
        size: 20,
        region: 'us-east',
        linode_id: null,
        created: '2026-06-13T00:00:00',
        tags: ['sh1pt'],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.provision({
      secret: (key: string) => key === 'LINODE_API_TOKEN' ? 'token' : undefined,
      log: vi.fn(),
      dryRun: false,
    }, {
      kind: 'block-storage',
      storage: 20,
      region: 'us-east',
      tags: ['sh1pt'],
    }, {})).resolves.toMatchObject({
      id: '456',
      kind: 'block-storage',
      status: 'running',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init!.body as string);
    expect(body.label).toMatch(/^sh1pt-bs-[a-z0-9]+-[a-z0-9]{4}$/);
    expect(body.label.length).toBeLessThanOrEqual(32);
  });

  it('varies generated labels for same-millisecond block storage creates', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.111111)
      .mockReturnValueOnce(0.222222);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        id: 456,
        label: 'sh1pt-bs-test',
        status: 'active',
        size: 20,
        region: 'us-east',
        linode_id: null,
        created: '2026-06-13T00:00:00',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const ctx = {
      secret: (key: string) => key === 'LINODE_API_TOKEN' ? 'token' : undefined,
      log: vi.fn(),
      dryRun: false,
    };

    await adapter.provision(ctx, { kind: 'block-storage', region: 'us-east' }, {});
    await adapter.provision(ctx, { kind: 'block-storage', region: 'us-east' }, {});

    const first = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string).label;
    const second = JSON.parse(fetchMock.mock.calls[1]![1]!.body as string).label;
    expect(first).not.toEqual(second);
    expect(first.length).toBeLessThanOrEqual(32);
    expect(second.length).toBeLessThanOrEqual(32);
  });

  it('does not create block storage when maxHourlyPrice is below the volume rate', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.provision({
      secret: (key: string) => key === 'LINODE_API_TOKEN' ? 'token' : undefined,
      log: vi.fn(),
      dryRun: false,
    }, {
      kind: 'block-storage',
      storage: 20,
      region: 'us-east',
      maxHourlyPrice: 0.001,
    }, {})).rejects.toThrow('exceeds maxHourlyPrice');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks block storage maxHourlyPrice before dry-run provisioning succeeds', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.provision({
      secret: (key: string) => key === 'LINODE_API_TOKEN' ? 'token' : undefined,
      log: vi.fn(),
      dryRun: true,
    }, {
      kind: 'block-storage',
      storage: 20,
      region: 'us-east',
      maxHourlyPrice: 0.001,
    }, {})).rejects.toThrow('exceeds maxHourlyPrice');

    expect(fetchMock).not.toHaveBeenCalled();
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

  it('does not fall back to a default billable type when hardware constraints filter all matches', async () => {
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
      cpu: 32,
      memory: 128,
      region: 'us-east',
    }, {})).rejects.toThrow('satisfies requested hardware constraints');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not fall back to a default billable type when the requested region has no match', async () => {
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
            region_availability: { 'us-east': 'unavailable' },
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
    }, {})).rejects.toThrow('linode: no matching type for kind=cpu-vps in us-east');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not provision dedicated CPU types for cpu-vps requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: [
          {
            id: 'g6-dedicated-2',
            label: 'Dedicated 4 GB',
            price: { hourly: 0.036, monthly: 24 },
            vcpus: 2,
            memory: 4096,
            disk: 81920,
            transfer: 4000,
            class: 'dedicated',
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.provision({
      secret: (key: string) => key === 'LINODE_API_TOKEN' ? 'token' : undefined,
      log: vi.fn(),
      dryRun: true,
    }, {
      kind: 'cpu-vps',
      region: 'us-east',
    }, {})).rejects.toThrow('linode: no matching type for kind=cpu-vps in us-east');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses dedicated CPU types for bare-metal dry-run provisioning', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: [
          {
            id: 'g6-dedicated-2',
            label: 'Dedicated 4 GB',
            price: { hourly: 0.036, monthly: 24 },
            vcpus: 2,
            memory: 4096,
            disk: 81920,
            transfer: 4000,
            class: 'dedicated',
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.provision({
      secret: (key: string) => key === 'LINODE_API_TOKEN' ? 'token' : undefined,
      log: vi.fn(),
      dryRun: true,
    }, {
      kind: 'bare-metal',
      region: 'us-east',
    }, {})).resolves.toMatchObject({
      kind: 'bare-metal',
      sku: 'g6-dedicated-2',
      hourlyRate: 0.036,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it('does not quote Linode as free when type pricing cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => 'temporarily unavailable',
    }));

    await expect(adapter.quote({
      secret: (key: string) => key === 'LINODE_API_TOKEN' ? 'token' : undefined,
      log: vi.fn(),
    }, { kind: 'cpu-vps', region: 'us-east' }, {})).rejects.toThrow('Linode GET /linode/types?page_size=500 failed: 503 temporarily unavailable');
  });

  it('does not quote Linode as free when no type matches the requested region', async () => {
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
            region_availability: { 'us-east': 'unavailable' },
          },
        ],
      }),
    }));

    await expect(adapter.quote({
      secret: (key: string) => key === 'LINODE_API_TOKEN' ? 'token' : undefined,
      log: vi.fn(),
    }, { kind: 'cpu-vps', region: 'us-east' }, {})).rejects.toThrow('linode: no matching type for kind=cpu-vps in us-east');
  });

  it('requests every page when listing instances and volumes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          data: [
            {
              id: 123,
              label: 'sh1pt-cpu-vps-test',
              status: 'running',
              type: 'g6-nanode-1',
              ipv4: ['203.0.113.10'],
              region: 'us-east',
              created: '2026-06-13T00:00:00',
              tags: ['sh1pt'],
            },
          ],
          page: 1,
          pages: 2,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          data: [
            {
              id: 124,
              label: 'sh1pt-cpu-vps-next',
              status: 'running',
              type: 'g6-standard-1',
              ipv4: ['203.0.113.11'],
              region: 'us-east',
              created: '2026-06-13T00:00:00',
              tags: ['sh1pt'],
            },
          ],
          page: 2,
          pages: 2,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          data: [
            {
              id: 456,
              label: 'sh1pt-volume',
              status: 'active',
              size: 20,
              region: 'us-east',
              created: '2026-06-13T00:00:00',
              tags: ['sh1pt'],
            },
          ],
          page: 1,
          pages: 1,
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.list({
      secret: (key: string) => key === 'LINODE_API_TOKEN' ? 'token' : undefined,
      log: vi.fn(),
    }, {})).resolves.toHaveLength(3);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.linode.com/v4/linode/instances?page=1&page_size=500',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.linode.com/v4/linode/instances?page=2&page_size=500',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://api.linode.com/v4/volumes?page=1&page_size=500',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('surfaces volume listing failures instead of returning partial inventory', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          data: [
            {
              id: 123,
              label: 'sh1pt-cpu-vps-test',
              status: 'running',
              type: 'g6-nanode-1',
              ipv4: ['203.0.113.10'],
              region: 'us-east',
              created: '2026-06-13T00:00:00',
              tags: ['sh1pt'],
            },
          ],
          page: 1,
          pages: 1,
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => JSON.stringify({ errors: [{ reason: 'token cannot list volumes' }] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.list({
      secret: (key: string) => key === 'LINODE_API_TOKEN' ? 'token' : undefined,
      log: vi.fn(),
    }, {})).rejects.toThrow('Linode GET /volumes?page=1&page_size=500 failed: 403 token cannot list volumes');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to volume destroy only when the instance is not found', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => JSON.stringify({ errors: [{ reason: 'not found' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.destroy({
      secret: (key: string) => key === 'LINODE_API_TOKEN' ? 'token' : undefined,
      log: vi.fn(),
      dryRun: false,
    }, '123', {})).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.linode.com/v4/linode/instances/123',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.linode.com/v4/volumes/123',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('does not call the API when destroy is a dry run', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.destroy({
      secret: (key: string) => key === 'LINODE_API_TOKEN' ? 'token' : undefined,
      log: vi.fn(),
      dryRun: true,
    }, '123', {})).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fall back to volume destroy on instance lifecycle errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      text: async () => JSON.stringify({ errors: [{ reason: 'instance is busy' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.destroy({
      secret: (key: string) => key === 'LINODE_API_TOKEN' ? 'token' : undefined,
      log: vi.fn(),
      dryRun: false,
    }, '123', {})).rejects.toThrow('409 instance is busy');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to volume status only when the instance is not found', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => JSON.stringify({ errors: [{ reason: 'not found' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: 456,
          label: 'sh1pt-volume',
          status: 'active',
          size: 20,
          region: 'us-east',
          linode_id: null,
          created: '2026-06-13T00:00:00',
          tags: ['sh1pt'],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.status({
      secret: (key: string) => key === 'LINODE_API_TOKEN' ? 'token' : undefined,
      log: vi.fn(),
    }, '456', {})).resolves.toMatchObject({
      id: '456',
      kind: 'block-storage',
      status: 'running',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not fall back to volume status on transient instance errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => 'temporarily unavailable',
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.status({
      secret: (key: string) => key === 'LINODE_API_TOKEN' ? 'token' : undefined,
      log: vi.fn(),
    }, '456', {})).rejects.toThrow('503 temporarily unavailable');

    expect(fetchMock).toHaveBeenCalledTimes(1);
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
