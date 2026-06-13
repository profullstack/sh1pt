import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('launches with the wrapped Lambda response shape', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/instance-types')) {
        return new Response(JSON.stringify(sampleTypes), { status: 200 });
      }
      return new Response(JSON.stringify({ data: { instance_ids: ['0920582c'] } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const instance = await cloud.provision(
      ctx,
      { kind: 'gpu', gpu: { model: 'A10', count: 1 }, region: 'us-west-1', maxHourlyPrice: 1 },
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
  });
});
