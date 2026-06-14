import { contractTestCloud } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

const API = 'https://api.cloudflare.com/client/v4';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Cloudflare cloud adapter', () => {
  it('connects to a configured account', async () => {
    const fetchMock = vi.fn(async () => ok({ id: 'acct-1', name: 'Example' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(connectCtx(), { accountId: 'acct-1' })).resolves.toEqual({ accountId: 'acct-1' });
    expect(fetchMock).toHaveBeenCalledWith(`${API}/accounts/acct-1`, expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
    }));
  });

  it('discovers the first accessible account when accountId is omitted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok([{ id: 'acct-2', name: 'First' }])));

    await expect(adapter.connect(connectCtx(), {})).resolves.toEqual({ accountId: 'acct-2' });
  });

  it('paginates account discovery when accountId is omitted', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const { searchParams } = new URL(url);
      if (searchParams.get('page') === '1') return ok([], { total_pages: 2 });
      if (searchParams.get('page') === '2') return ok([{ id: 'acct-2', name: 'Second page' }], { total_pages: 2 });
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(connectCtx(), {})).resolves.toEqual({ accountId: 'acct-2' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('creates an R2 bucket', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(`${API}/accounts/acct-1/r2/buckets`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toEqual({ name: 'assets' });
      return ok({ name: 'assets', creation_date: '2026-06-14T00:00:00Z', location: 'WNAM' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const instance = await adapter.provision(
      provisionCtx(),
      { kind: 'object-storage', storage: 10, region: 'auto' },
      { accountId: 'acct-1', resourceType: 'r2-bucket', name: 'assets' },
    );

    expect(instance).toMatchObject({
      id: 'r2:assets',
      kind: 'object-storage',
      status: 'running',
      sku: 'r2-bucket',
      region: 'WNAM',
    });
  });

  it('creates a D1 database with a location hint', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(`${API}/accounts/acct-1/d1/database`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toEqual({ name: 'main-db', primary_location_hint: 'weur' });
      return ok({ uuid: 'db-1', name: 'main-db', created_at: '2026-06-14T00:00:00Z' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const instance = await adapter.provision(
      provisionCtx(),
      { kind: 'managed-db', region: 'weur' },
      { accountId: 'acct-1', name: 'main-db' },
    );

    expect(instance).toMatchObject({
      id: 'd1:db-1',
      kind: 'managed-db',
      status: 'running',
      sku: 'd1-database',
      region: 'weur',
    });
  });

  it('does not call the API in dry-run provision or destroy', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const instance = await adapter.provision(
      provisionCtx(true),
      { kind: 'object-storage', storage: 10 },
      { accountId: 'acct-1', name: 'assets' },
    );
    await adapter.destroy(provisionCtx(true), 'r2:assets', { accountId: 'acct-1' });

    expect(instance.id).toBe('r2:dry-run-assets');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists supported Cloudflare resources, including nested R2 bucket responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const { pathname } = new URL(url);
      if (pathname.endsWith('/r2/buckets')) return ok({ buckets: [{ name: 'assets', creation_date: '2026-06-14T00:00:00Z' }] });
      if (pathname.endsWith('/d1/database')) return ok([{ uuid: 'db-1', name: 'main', created_at: '2026-06-14T00:00:00Z' }]);
      if (pathname.endsWith('/queues')) return ok([{ queue_id: 'queue-1', queue_name: 'jobs', created_on: '2026-06-14T00:00:00Z' }]);
      if (pathname.endsWith('/cfd_tunnel')) return ok([{ id: 'tun-1', name: 'edge', status: 'healthy', created_at: '2026-06-14T00:00:00Z' }]);
      throw new Error(`unexpected url ${url}`);
    }));

    const instances = await adapter.list(connectCtx(), { accountId: 'acct-1' });

    expect(instances.map((instance) => instance.id).sort()).toEqual([
      'd1:db-1',
      'queue:queue-1',
      'r2:assets',
      'tunnel:tun-1',
    ]);
    expect(instances.find((instance) => instance.id === 'queue:queue-1')?.kind).toBe('object-storage');
    expect(instances.find((instance) => instance.id === 'tunnel:tun-1')?.kind).toBe('object-storage');
    expect(instances.find((instance) => instance.id === 'tunnel:tun-1')?.status).toBe('running');
  });

  it('checks status using the prefixed resource id', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe(`${API}/accounts/acct-1/queues/queue-1`);
      return ok({ queue_id: 'queue-1', queue_name: 'jobs', created_on: '2026-06-14T00:00:00Z' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const instance = await adapter.status(connectCtx(), 'queue:queue-1', { accountId: 'acct-1' });

    expect(instance).toMatchObject({ id: 'queue:queue-1', status: 'running', sku: 'queue' });
  });

  it('requires a caller-supplied tunnel secret when creating a tunnel', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.provision(
      provisionCtx(),
      { kind: 'object-storage', region: 'auto' },
      { accountId: 'acct-1', resourceType: 'tunnel', name: 'edge' },
    )).rejects.toThrow('Cloudflare tunnel provisioning requires config.tunnelSecret');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates a tunnel with a caller-supplied tunnel secret', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(`${API}/accounts/acct-1/cfd_tunnel`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toEqual({
        name: 'edge',
        config_src: 'cloudflare',
        tunnel_secret: 'known-secret',
      });
      return ok({
        id: 'tun-1',
        name: 'edge',
        status: 'healthy',
        tunnel_token: 'cloudflared-token',
        created_at: '2026-06-14T00:00:00Z',
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const instance = await adapter.provision(
      provisionCtx(),
      { kind: 'managed-db', region: 'auto' },
      { accountId: 'acct-1', resourceType: 'tunnel', name: 'edge', tunnelSecret: 'known-secret' },
    );

    expect(instance).toMatchObject({
      id: 'tunnel:tun-1',
      kind: 'object-storage',
      status: 'running',
      sku: 'tunnel',
      metadata: { cloudflareTunnelToken: 'cloudflared-token' },
    });
  });

  it('deletes the prefixed resource id', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(`${API}/accounts/acct-1/cfd_tunnel/tun-1`);
      expect(init.method).toBe('DELETE');
      return ok({ id: 'tun-1' });
    });
    vi.stubGlobal('fetch', fetchMock);

    await adapter.destroy(provisionCtx(), 'tunnel:tun-1', { accountId: 'acct-1' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports Cloudflare API errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: false,
      errors: [{ code: 10000, message: 'Authentication error' }],
      result: null,
    }))));

    await expect(adapter.connect(connectCtx(), { accountId: 'acct-1' }))
      .rejects.toThrow('Cloudflare GET /accounts/acct-1 failed: Authentication error');
  });

  it('reports non-JSON error responses without masking the provider response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('maintenance', { status: 503, statusText: 'Service Unavailable' })));

    await expect(adapter.connect(connectCtx(), { accountId: 'acct-1' }))
      .rejects.toThrow('Cloudflare GET /accounts/acct-1 failed: 503 maintenance');
  });
});

contractTestCloud(adapter, {
  sampleConfig: { accountId: 'acct-1', resourceType: 'r2-bucket', name: 'assets' },
  sampleSpec: { kind: 'object-storage', storage: 10, region: 'auto' },
  requiredSecrets: ['CLOUDFLARE_API_TOKEN'],
});

function connectCtx() {
  return {
    secret: (key: string) => key === 'CLOUDFLARE_API_TOKEN' ? 'test-token' : undefined,
    log: vi.fn(),
  };
}

function provisionCtx(dryRun = false) {
  return {
    ...connectCtx(),
    dryRun,
  };
}

function ok(result: unknown, resultInfo?: unknown) {
  return new Response(JSON.stringify({
    success: true,
    errors: [],
    messages: [],
    result,
    result_info: resultInfo,
  }));
}
