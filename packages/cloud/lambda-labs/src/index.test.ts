import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contractTestCloud } from '@profullstack/sh1pt-core/testing';
import cloud from './index.js';

const sampleTypes = {
  data: {
    gpu_1x_a10: {
      instance_type: {
        name: 'gpu_1x_a10',
        description: '1x A10 (24 GB PCIe)',
        gpu_description: 'A10 (24 GB PCIe)',
        price_cents_per_hour: 75,
        specs: { vcpus: 30, memory_gib: 200, storage_gib: 1400, gpus: 1 },
      },
      regions_with_capacity_available: [{ name: 'us-west-1', description: 'US West' }],
    },
    gpu_1x_a100: {
      instance_type: {
        name: 'gpu_1x_a100',
        description: '1x A100 (40 GB PCIe)',
        gpu_description: 'A100 (40 GB PCIe)',
        price_cents_per_hour: 129,
        specs: { vcpus: 30, memory_gib: 200, storage_gib: 1400, gpus: 1 },
      },
      regions_with_capacity_available: [{ name: 'us-west-1', description: 'US West' }],
    },
  },
};

const ctx = {
  secret: (key: string) => key === 'LAMBDA_CLOUD_API_KEY' ? 'test' : undefined,
  log: vi.fn(),
  dryRun: false,
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(sampleTypes), { status: 200 })));
});

afterEach(() => {
  vi.restoreAllMocks();
});

contractTestCloud(cloud, {
  sampleConfig: { sshKeyNames: ['test-key'] },
  sampleSpec: { kind: 'gpu', gpu: { model: 'A10', count: 1 }, region: 'us-west-1' },
  requiredSecrets: ['LAMBDA_CLOUD_API_KEY'],
});

describe('lambda-labs cloud adapter', () => {
  it('reports API errors with status and message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'auth_failed', message: 'invalid key' } }), { status: 401 })));

    await expect(cloud.connect(ctx, {})).rejects.toThrow('401 auth_failed');
  });

  it('quotes the cheapest matching GPU type', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(sampleTypes), { status: 200 })));

    const quote = await cloud.quote(ctx, { kind: 'gpu', gpu: { model: 'A10', count: 1 }, region: 'us-west-1' }, {});

    expect(quote).toMatchObject({
      hourly: 0.75,
      monthly: 547.5,
      currency: 'USD',
      provider: 'lambda-labs',
      sku: 'gpu_1x_a10',
    });
  });

  it('does not match short GPU names inside larger model names', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: { gpu_1x_a100: sampleTypes.data.gpu_1x_a100 },
    }), { status: 200 })));

    const quote = await cloud.quote(ctx, { kind: 'gpu', gpu: { model: 'A10', count: 1 }, region: 'us-west-1' }, {});

    expect(quote.sku).toBe('none');
    expect(quote.hourly).toBe(0);
  });

  it('dry-run provision never calls fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const instance = await cloud.provision({ ...ctx, dryRun: true }, { kind: 'gpu', gpu: { model: 'A10', count: 1 } }, {});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(instance).toMatchObject({ id: 'dry-run', kind: 'gpu', status: 'provisioning' });
  });

  it('requires an SSH key name before billable launch', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(sampleTypes), { status: 200 })));

    await expect(cloud.provision(ctx, { kind: 'gpu', gpu: { model: 'A10', count: 1 } }, {})).rejects.toThrow('SSH key name');
  });

  it('rejects multiple SSH key names instead of silently truncating them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(sampleTypes), { status: 200 })));

    await expect(cloud.provision(
      ctx,
      { kind: 'gpu', gpu: { model: 'A10', count: 1 } },
      { sshKeyNames: ['key-one', 'key-two'] },
    )).rejects.toThrow('exactly one SSH key name');
  });

  it('launches with the wrapped Lambda response shape', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/instance-types')) {
        return new Response(JSON.stringify(sampleTypes), { status: 200 });
      }
      return new Response(JSON.stringify({ data: { instance_ids: ['0920582c'] } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const instance = await cloud.provision(
      ctx,
      { kind: 'gpu', gpu: { model: 'A10', count: 1 }, region: 'us-west-1', maxHourlyPrice: 1, tags: ['team:infra', 'sh1pt'] },
      { sshKeyNames: ['default-key'], tags: { app: 'sh1pt' } },
    );

    expect(instance).toMatchObject({
      id: '0920582c',
      kind: 'gpu',
      status: 'provisioning',
      hourlyRate: 0.75,
      sku: 'gpu_1x_a10',
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://cloud.lambda.ai/api/v1/instance-operations/launch',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"ssh_key_names":["default-key"]'),
      }),
    );
    const request = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      tags: [
        { key: 'app', value: 'sh1pt' },
        { key: 'team', value: 'infra' },
        { key: 'tag-2', value: 'sh1pt' },
      ],
    });
  });

  it('throws when launch succeeds without an instance id', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/instance-types')) {
        return new Response(JSON.stringify(sampleTypes), { status: 200 });
      }
      return new Response(JSON.stringify({ data: { instance_ids: [] } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(cloud.provision(
      ctx,
      { kind: 'gpu', gpu: { model: 'A10', count: 1 }, region: 'us-west-1', maxHourlyPrice: 1 },
      { sshKeyNames: ['default-key'] },
    )).rejects.toThrow('returned no instance ID');
  });

  it('preserves Lambda instance timestamp fields in status responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: {
        id: '0920582c',
        status: 'active',
        ip: '198.51.100.2',
        private_ip: '10.0.2.100',
        created_at: '2026-06-13T19:30:00Z',
        ssh_key_names: ['default-key'],
        file_system_names: [],
        region: { name: 'us-west-1', description: 'US West' },
        instance_type: sampleTypes.data.gpu_1x_a10.instance_type,
        actions: {},
        tags: [{ key: 'team', value: 'infra' }],
      },
    }), { status: 200 })));

    const instance = await cloud.status(ctx, '0920582c', {});

    expect(instance).toMatchObject({
      id: '0920582c',
      status: 'running',
      createdAt: '2026-06-13T19:30:00Z',
      publicIp: '198.51.100.2',
      privateIp: '10.0.2.100',
      tags: ['team:infra'],
    });
  });

  it('uses a stable unknown timestamp when Lambda omits creation time', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: {
        id: 'terminating-id',
        status: 'terminating',
        ssh_key_names: ['default-key'],
        file_system_names: [],
        region: { name: 'us-west-1', description: 'US West' },
        instance_type: sampleTypes.data.gpu_1x_a10.instance_type,
        actions: {},
      },
    }), { status: 200 })));

    const instance = await cloud.status(ctx, 'terminating-id', {});

    expect(instance).toMatchObject({
      id: 'terminating-id',
      status: 'stopped',
      createdAt: '1970-01-01T00:00:00.000Z',
    });
  });
});
