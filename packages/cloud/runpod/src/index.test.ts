import { contractTestCloud } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

const API = 'https://api.runpod.io/graphql';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RunPod cloud adapter', () => {
  it('connects by querying the authenticated RunPod account', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(API);
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual(expect.objectContaining({
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      }));
      expect(JSON.parse(String(init.body)).query).toContain('myself');
      return graphql({ myself: { id: 'user-1', email: 'ops@example.com' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(connectCtx(), {})).resolves.toEqual({ accountId: 'user-1' });
  });

  it('reports a scoped account error when RunPod returns no account', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => graphql({ myself: null })));

    await expect(adapter.connect(connectCtx(), {})).rejects.toThrow('RunPod account not available');
  });

  it('quotes from configured hourly pricing without calling RunPod', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const quote = await adapter.quote(
      connectCtx(),
      { kind: 'gpu', gpu: { model: 'NVIDIA RTX A6000', count: 2 } },
      { hourlyPrice: 0.49, gpuTypeId: 'NVIDIA RTX A6000', cloudType: 'COMMUNITY' },
    );

    expect(quote).toMatchObject({
      hourly: 0.98,
      monthly: 715.4,
      provider: 'runpod',
      currency: 'USD',
      sku: 'NVIDIA RTX A6000 x2',
      availabilityZone: 'COMMUNITY',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('quotes from RunPod on-demand GPU type pricing when hourlyPrice is omitted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => graphql({
      gpuTypes: [{
        id: 'NVIDIA RTX A6000',
        displayName: 'RTX A6000',
        communityPrice: 0.44,
        securePrice: 0.79,
        communitySpotPrice: 0.22,
      }],
    })));

    const quote = await adapter.quote(
      connectCtx(),
      { kind: 'gpu', gpu: { model: 'RTX A6000', count: 2 }, spotOk: true },
      { cloudType: 'COMMUNITY' },
    );

    expect(quote.hourly).toBe(0.88);
    expect(quote.spot).toBe(false);
  });

  it('uses the highest available price for ALL cloud type quotes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => graphql({
      gpuTypes: [{
        id: 'NVIDIA RTX A6000',
        displayName: 'RTX A6000',
        communityPrice: 0.44,
        securePrice: 0.79,
      }],
    })));

    const quote = await adapter.quote(
      connectCtx(),
      { kind: 'gpu', gpu: { model: 'RTX A6000', count: 1 } },
      {},
    );

    expect(quote.hourly).toBe(0.79);
  });

  it('reports a clear error when RunPod returns no GPU types', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => graphql({ gpuTypes: null })));

    await expect(adapter.quote(
      connectCtx(),
      { kind: 'gpu', gpu: { model: 'RTX A6000', count: 1 } },
      {},
    )).rejects.toThrow('RunPod GPU type not found: RTX A6000');
  });

  it('does not silently fall back to a different GPU type', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => graphql({
      gpuTypes: [{ id: 'NVIDIA A100', displayName: 'A100', communityPrice: 1.25 }],
    })));

    await expect(adapter.quote(
      connectCtx(),
      { kind: 'gpu', gpu: { model: 'RTX A6000', count: 1 } },
      {},
    )).rejects.toThrow('RunPod GPU type not found: RTX A6000');
  });

  it('creates a RunPod pod through GraphQL', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.query).toContain('podFindAndDeployOnDemand');
      expect(body.variables.input).toEqual({
        cloudType: 'SECURE',
        gpuCount: 1,
        gpuTypeId: 'NVIDIA RTX A6000',
        name: 'trainer',
        imageName: 'runpod/pytorch',
        ports: '8888/http',
        volumeInGb: 40,
        containerDiskInGb: 20,
        minVcpuCount: 4,
        minMemoryInGb: 16,
        env: [{ key: 'JUPYTER_PASSWORD', value: 'secret' }],
      });
      return graphql({
        podFindAndDeployOnDemand: pod({
          id: 'pod-1',
          name: 'trainer',
          desiredStatus: 'RUNNING',
          imageName: 'runpod/pytorch',
          costPerHr: 0.79,
        }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const instance = await adapter.provision(
      provisionCtx(),
      { kind: 'gpu', gpu: { model: 'NVIDIA RTX A6000', count: 1 }, cpu: 4, memory: 16, maxHourlyPrice: 1 },
      {
        cloudType: 'SECURE',
        gpuTypeId: 'NVIDIA RTX A6000',
        imageName: 'runpod/pytorch',
        name: 'trainer',
        hourlyPrice: 0.79,
        ports: '8888/http',
        volumeInGb: 40,
        containerDiskInGb: 20,
        env: { JUPYTER_PASSWORD: 'secret' },
      },
    );

    expect(instance).toMatchObject({
      id: 'pod-1',
      kind: 'gpu',
      status: 'running',
      hourlyRate: 0.79,
      sku: 'runpod/pytorch',
    });
  });

  it('reports unavailable capacity when RunPod returns no provisioned pod', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.query).toContain('podFindAndDeployOnDemand');
      return graphql({ podFindAndDeployOnDemand: null });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.provision(
      provisionCtx(),
      { kind: 'gpu', gpu: { model: 'NVIDIA RTX A6000', count: 1 } },
      { gpuTypeId: 'NVIDIA RTX A6000', imageName: 'runpod/pytorch', hourlyPrice: 0.5 },
    )).rejects.toThrow('RunPod pod was not provisioned');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('omits network volume storage unless explicitly requested', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.query).toContain('podFindAndDeployOnDemand');
      expect(body.variables.input).toEqual(expect.objectContaining({
        gpuTypeId: 'NVIDIA RTX A6000',
        imageName: 'runpod/pytorch',
        containerDiskInGb: 40,
      }));
      expect(body.variables.input).not.toHaveProperty('volumeInGb');
      return graphql({
        podFindAndDeployOnDemand: pod({
          id: 'pod-1',
          imageName: 'runpod/pytorch',
          costPerHr: 0.5,
        }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await adapter.provision(
      provisionCtx(),
      { kind: 'gpu', gpu: { model: 'NVIDIA RTX A6000', count: 1 } },
      {
        gpuTypeId: 'NVIDIA RTX A6000',
        imageName: 'runpod/pytorch',
        hourlyPrice: 0.5,
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('requires imageName before creating a real pod', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.provision(
      provisionCtx(),
      { kind: 'gpu', gpu: { model: 'NVIDIA RTX A6000', count: 1 } },
      { hourlyPrice: 0.5 },
    )).rejects.toThrow('config.imageName is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call RunPod for dry-run provisioning without hourlyPrice', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const instance = await adapter.provision(
      provisionCtx(true),
      { kind: 'gpu', gpu: { model: 'NVIDIA RTX A6000', count: 1 } },
      { name: 'preview' },
    );

    expect(instance).toMatchObject({
      id: 'dry-run-preview',
      status: 'provisioning',
      hourlyRate: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('honors maxHourlyPrice before provisioning', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.provision(
      provisionCtx(),
      { kind: 'gpu', gpu: { model: 'NVIDIA RTX A6000', count: 1 }, maxHourlyPrice: 0.01 },
      { hourlyPrice: 0.5, imageName: 'runpod/pytorch' },
    )).rejects.toThrow('exceeds maxHourlyPrice');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses on-demand pricing for maxHourlyPrice even when spot is allowed', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.query).toContain('GpuTypes');
      return graphql({
        gpuTypes: [{
          id: 'NVIDIA RTX A6000',
          displayName: 'RTX A6000',
          communityPrice: 0.44,
          communitySpotPrice: 0.22,
        }],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.provision(
      provisionCtx(),
      { kind: 'gpu', gpu: { model: 'NVIDIA RTX A6000', count: 1 }, spotOk: true, maxHourlyPrice: 0.3 },
      { imageName: 'runpod/pytorch', cloudType: 'COMMUNITY' },
    )).rejects.toThrow('exceeds maxHourlyPrice');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('lists pods from the authenticated account', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => graphql({
      myself: {
        pods: [
          pod({ id: 'pod-1', name: 'trainer', desiredStatus: 'RUNNING', costPerHr: 0.44 }),
          pod({ id: 'pod-2', name: 'stopped', desiredStatus: 'EXITED', costPerHr: 0 }),
        ],
      },
    })));

    const instances = await adapter.list(connectCtx(), {});

    expect(instances.map((instance) => [instance.id, instance.status])).toEqual([
      ['pod-1', 'running'],
      ['pod-2', 'stopped'],
    ]);
  });

  it('reports a scoped account error when listing has no account', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => graphql({ myself: null })));

    await expect(adapter.list(connectCtx(), {})).rejects.toThrow('RunPod account not available');
  });

  it('checks status for a single pod', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.query).toContain('query Pod');
      expect(body.variables).toEqual({ input: { podId: 'pod-1' } });
      return graphql({ pod: pod({ id: 'pod-1', desiredStatus: 'RUNNING', costPerHr: 0.44 }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.status(connectCtx(), 'pod-1', {})).resolves.toMatchObject({
      id: 'pod-1',
      status: 'running',
      publicIp: '203.0.113.10',
    });
  });

  it('terminates a pod through GraphQL', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.query).toContain('podTerminate');
      expect(body.variables).toEqual({ input: { podId: 'pod-1' } });
      return graphql({ podTerminate: null });
    });
    vi.stubGlobal('fetch', fetchMock);

    await adapter.destroy(provisionCtx(), 'pod-1', {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports GraphQL errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      errors: [{ message: 'not authorized' }],
    }), { status: 200 })));

    await expect(adapter.connect(connectCtx(), {})).rejects.toThrow('RunPod GraphQL failed: not authorized');
  });
});

contractTestCloud(adapter, {
  sampleConfig: { cloudType: 'COMMUNITY', hourlyPrice: 0.001 },
  sampleSpec: { kind: 'gpu', gpu: { model: 'NVIDIA RTX A6000', count: 1 } },
  requiredSecrets: ['RUNPOD_API_KEY'],
});

function connectCtx() {
  return {
    secret: (key: string) => key === 'RUNPOD_API_KEY' ? 'test-token' : undefined,
    log: vi.fn(),
  };
}

function provisionCtx(dryRun = false) {
  return {
    ...connectCtx(),
    dryRun,
  };
}

function graphql(data: unknown) {
  return new Response(JSON.stringify({ data }));
}

function pod(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pod-1',
    name: 'trainer',
    desiredStatus: 'RUNNING',
    createdAt: '2026-06-14T00:00:00Z',
    costPerHr: 0.44,
    imageName: 'runpod/pytorch',
    runtime: {
      ports: [{ ip: '203.0.113.10', isIpPublic: true, publicPort: 8888, privatePort: 8888, type: 'http' }],
    },
    ...overrides,
  };
}
