import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestCloud } from '@profullstack/sh1pt-core/testing';
import adapter, {
  PLANS,
  adoptable,
  orderInstructions,
  panelUrl,
  pickPlan,
  planFor,
  resolveServices,
  serviceId,
  toInstance,
} from './index.js';

const SECRETS = (key: string): string | undefined => ({ PULSEDMEDIA_PASSWORD: 'hunter2' }[key]);

const ctx = (overrides: Partial<{ secret: (k: string) => string | undefined; dryRun: boolean }> = {}) => ({
  secret: overrides.secret ?? SECRETS,
  log: vi.fn(),
  dryRun: overrides.dryRun ?? false,
});

function response(status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => '' };
}

const SERVICE = { host: 'ha1.pulsedmedia.com', username: 'anthony' };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('pulsedmedia cloud adapter', () => {
  it('refuses to act without the seedbox password', async () => {
    await expect(adapter.connect(ctx({ secret: () => undefined }), SERVICE))
      .rejects.toThrow(/PULSEDMEDIA_PASSWORD/);
  });

  it('connects by probing the PMSS panel with basic auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(ctx(), SERVICE)).resolves.toEqual({ accountId: 'anthony' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://ha1.pulsedmedia.com/user-anthony/');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('anthony:hunter2').toString('base64')}`);
  });

  it('reports a rejected password distinctly from an unreachable host', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(401)));
    await expect(adapter.connect(ctx(), SERVICE)).rejects.toThrow(/rejected the stored password/);
  });

  it('connects without services configured rather than throwing', async () => {
    const c = ctx();
    await expect(adapter.connect(c, {})).resolves.toEqual({ accountId: 'pulsedmedia' });
    expect(c.log).toHaveBeenCalledWith(expect.stringContaining('no services configured'), 'warn');
  });
});

describe('quote', () => {
  it('quotes the cheapest storage plan that fits, in EUR', async () => {
    const quote = await adapter.quote(ctx(), { kind: 'block-storage', storage: 3000 }, {});
    expect(quote).toMatchObject({
      sku: 'Eternal Väinämöinen Storage 4TB R5 10G',
      monthly: 3.99,
      currency: 'EUR',
      provider: 'pulsedmedia',
      spot: false,
    });
    expect(quote.hourly).toBeCloseTo(3.99 / 730, 4);
  });

  it('quotes a seedbox plan for cpu-vps specs', async () => {
    const quote = await adapter.quote(ctx(), { kind: 'cpu-vps', cpu: 4, memory: 4 }, {});
    expect(quote.sku).toBe('Eternal Väinämöinen Seedbox 8TB R5 10G');
    expect(quote.monthly).toBe(9.99);
  });

  it('will not price a dedicated server', async () => {
    const quote = await adapter.quote(ctx(), { kind: 'bare-metal' }, {});
    expect(quote).toMatchObject({ sku: 'dedicated-on-request', monthly: 0 });
  });

  it('returns a zero quote when nothing satisfies the spec', async () => {
    const quote = await adapter.quote(ctx(), { kind: 'block-storage', storage: 999_999 }, {});
    expect(quote.sku).toBe('none');
  });

  it('honors maxHourlyPrice', async () => {
    const capped = pickPlan({ kind: 'block-storage', storage: 4000, maxHourlyPrice: 0.001 });
    expect(capped).toBeNull();
  });

  it('excludes plans that do not publish cpu when the spec asks for cpu', () => {
    const plan = pickPlan({ kind: 'cpu-vps', cpu: 2, storage: 2000 });
    // 'M10G 10Gbps RAID5' is 2TB and cheaper per TB, but publishes no core
    // count, so it must not win a cpu-constrained quote.
    expect(plan?.sku).not.toBe('M10G 10Gbps RAID5');
    expect(plan?.cpu).toBeGreaterThanOrEqual(2);
  });

  it('omits the unorderable trophy giveaway plans from the price table', () => {
    expect(PLANS.some(p => /trophy/i.test(p.sku))).toBe(false);
  });
});

describe('inventory', () => {
  it('collapses the host+username shorthand and the services list, deduped', () => {
    const services = resolveServices({
      services: [SERVICE, { host: 'ha2.pulsedmedia.com', username: 'anthony' }],
      host: SERVICE.host,
      username: SERVICE.username,
    });
    expect(services.map(serviceId)).toEqual(['anthony@ha1.pulsedmedia.com', 'anthony@ha2.pulsedmedia.com']);
  });

  it('lists a service whose panel is down as failed instead of dropping it', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response(502)));

    const instances = await adapter.list(ctx(), {
      services: [SERVICE, { host: 'ha2.pulsedmedia.com', username: 'anthony' }],
    });
    expect(instances.map(i => i.status)).toEqual(['running', 'failed']);
  });

  it('carries plan facts into instance metadata when the sku is known', () => {
    const instance = toInstance({ ...SERVICE, sku: 'M10G Storage Box 8TB' }, 'running');
    expect(instance).toMatchObject({ id: 'anthony@ha1.pulsedmedia.com', kind: 'block-storage', currency: 'EUR' });
    expect(instance.hourlyRate).toBeCloseTo(14.99 / 730, 4);
    expect(instance.metadata).toMatchObject({ storageGb: 8000, portGbps: 10, panel: panelUrl(SERVICE) });
  });

  it('falls back to cpu-vps and a zero rate for an unknown sku', () => {
    const instance = toInstance({ ...SERVICE, sku: 'something-they-never-sold' }, 'running');
    expect(instance.kind).toBe('cpu-vps');
    expect(instance.hourlyRate).toBe(0);
  });

  it('resolves a plan from a partial sku', () => {
    expect(planFor({ ...SERVICE, sku: 'Streambox 1' })?.monthly).toBe(4.2);
  });

  it('rejects a status lookup for a service that is not configured', async () => {
    await expect(adapter.status(ctx(), 'ghost@ha9.pulsedmedia.com', { services: [SERVICE] }))
      .rejects.toThrow(/not in the provider config/);
  });
});

describe('provision', () => {
  it('points at the store when nothing is configured to adopt', async () => {
    await expect(adapter.provision(ctx(), { kind: 'block-storage', storage: 4000 }, {}))
      .rejects.toThrow(/no order API/);
  });

  it('names the plan and the store URL in the order instructions', () => {
    const message = orderInstructions({ kind: 'block-storage', storage: 4000 }, 0);
    expect(message).toContain('Eternal Väinämöinen Storage 4TB R5 10G');
    expect(message).toContain('store/the-eternal-vainamoinen');
  });

  it('refuses to guess between two matching services', async () => {
    await expect(adapter.provision(ctx(), { kind: 'cpu-vps' }, {
      services: [
        { ...SERVICE, sku: 'M1000 SSD' },
        { host: 'ha2.pulsedmedia.com', username: 'anthony', sku: 'M10G SSD 320G' },
      ],
    })).rejects.toThrow(/Refusing to guess/);
  });

  it('adopts the one matching service and verifies the panel', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetchMock);

    const instance = await adapter.provision(ctx(), { kind: 'block-storage' }, {
      services: [
        { ...SERVICE, sku: 'M10G Storage Box 4TB' },
        { host: 'ha2.pulsedmedia.com', username: 'anthony', sku: 'M1000 SSD' },
      ],
    });
    expect(instance).toMatchObject({ id: 'anthony@ha1.pulsedmedia.com', status: 'running', kind: 'block-storage' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not contact the panel on a dry run', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const instance = await adapter.provision(ctx({ dryRun: true }), { kind: 'block-storage' }, {
      services: [{ ...SERVICE, sku: 'M10G Storage Box 4TB' }],
    });
    expect(instance.status).toBe('provisioning');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps a service with no sku adoptable', () => {
    expect(adoptable([SERVICE], { kind: 'cpu-vps' })).toHaveLength(1);
  });
});

describe('destroy', () => {
  it('refuses, because cancelling is a client-area action that keeps billing until done', async () => {
    await expect(adapter.destroy(ctx(), 'anthony@ha1.pulsedmedia.com', {}))
      .rejects.toThrow(/Request Cancellation/);
  });
});

contractTestCloud(adapter, {
  sampleConfig: { services: [{ host: 'ha1.pulsedmedia.com', username: 'demo', sku: 'M10G Storage Box 4TB' }] },
  sampleSpec: { kind: 'block-storage', storage: 4000 },
  requiredSecrets: ['PULSEDMEDIA_PASSWORD'],
});
