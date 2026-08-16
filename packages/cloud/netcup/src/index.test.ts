import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter, { adoptable, pickImage, pickPlan, sanitizeHostname, serverToInstance, resetTokenCache } from './index.js';

const CLIENT_SECRETS = (key: string): string | undefined => ({
  NETCUP_SCP_CLIENT_ID: 'client-abc',
  NETCUP_SCP_CLIENT_SECRET: 'shhh',
}[key]);

const ctx = (overrides: Partial<{ secret: (k: string) => string | undefined; dryRun: boolean }> = {}) => ({
  secret: overrides.secret ?? CLIENT_SECRETS,
  log: vi.fn(),
  dryRun: overrides.dryRun ?? false,
});

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

const TOKEN = jsonResponse({ access_token: 'tok', expires_in: 300 });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetTokenCache();
});

describe('netcup cloud adapter', () => {
  it('connects with client credentials and reports the account', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(TOKEN)
      .mockResolvedValueOnce(jsonResponse([{ id: 1, name: 'v220', disabled: false }]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.connect(ctx(), {})).resolves.toEqual({ accountId: 'client-abc' });

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]!;
    expect(tokenUrl).toContain('/protocol/openid-connect/token');
    expect(String(tokenInit.body)).toContain('grant_type=client_credentials');
  });

  it('refuses to act without credentials', async () => {
    await expect(adapter.connect(ctx({ secret: () => undefined }), {}))
      .rejects.toThrow(/NETCUP_SCP_CLIENT_ID/);
  });

  it('quotes from the published price list in EUR', async () => {
    const quote = await adapter.quote(ctx(), { kind: 'cpu-vps', cpu: 8, memory: 16 }, {});
    expect(quote).toMatchObject({ sku: 'VPS 2000 G12', monthly: 19.25, currency: 'EUR', spot: false });
    expect(quote.hourly).toBeCloseTo(19.25 / 730, 4);
  });

  it('picks the cheapest plan that satisfies the spec', () => {
    expect(pickPlan({ kind: 'cpu-vps', memory: 8 })?.sku).toBe('VPS 1000 G12');
    expect(pickPlan({ kind: 'cpu-vps', memory: 9 })?.sku).toBe('VPS 2000 G12');
    expect(pickPlan({ kind: 'cpu-vps', memory: 512 })).toBeNull();
  });

  it('never adopts a server that already has an OS installed', () => {
    const servers = [
      { id: 1, name: 'v1', disabled: false, template: { id: 7, name: 'Ubuntu 24.04' } },
      { id: 2, name: 'v2', disabled: false, template: null },
      { id: 3, name: 'v3', disabled: true, template: null },
    ];
    expect(adoptable(servers).map(s => s.id)).toEqual([2]);
  });

  it('filters adoption candidates by prefix', () => {
    const servers = [
      { id: 1, name: 'pit-box', disabled: false, template: null },
      { id: 2, name: 'other', disabled: false, template: null },
    ];
    expect(adoptable(servers, 'pit').map(s => s.id)).toEqual([1]);
  });

  it('tells you to go buy one when nothing is adoptable', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(TOKEN)
      .mockResolvedValueOnce(jsonResponse([{ id: 1, name: 'v1', disabled: false, template: { id: 7, name: 'Ubuntu' } }])));

    await expect(adapter.provision(ctx(), { kind: 'cpu-vps', memory: 16 }, {}))
      .rejects.toThrow(/no order API[\s\S]*VPS 2000 G12/);
  });

  it('refuses to guess between multiple uninstalled servers', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(TOKEN)
      .mockResolvedValueOnce(jsonResponse([
        { id: 1, name: 'v1', disabled: false, template: null },
        { id: 2, name: 'v2', disabled: false, template: null },
      ])));

    await expect(adapter.provision(ctx(), { kind: 'cpu-vps' }, {}))
      .rejects.toThrow(/refusing to guess/);
  });

  it('installs the image with ssh keys and the custom script', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(TOKEN)
      .mockResolvedValueOnce(jsonResponse([{ id: 42, name: 'v42', nickname: 'pit', disabled: false, template: null }]))
      .mockResolvedValueOnce(jsonResponse([{ id: 9, name: 'Ubuntu 24.04 LTS', alias: 'Ubuntu 24.04' }]))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({
        id: 42, name: 'v42', disabled: false,
        serverLiveInfo: { state: 'ON', cpuCount: 8, maxServerMemoryInMiB: 16384 },
        ipv4Addresses: [{ id: 1, ip: '203.0.113.9' }],
        site: { id: 2, city: 'Nuremberg' },
        maxCpuCount: 8,
      }));
    vi.stubGlobal('fetch', fetchMock);

    const instance = await adapter.provision(
      ctx(),
      { kind: 'cpu-vps', sshKeyIds: ['5'], tags: ['dev.moshcode.sh'] },
      { customScript: '#!/bin/bash\nroot-ubuntu.sh' },
    );

    const installBody = JSON.parse(String(fetchMock.mock.calls[3]![1].body));
    expect(installBody).toMatchObject({
      imageFlavourId: 9,
      hostname: 'dev.moshcode.sh',
      sshKeyIds: [5],
      sshPasswordAuthentication: false,
      customScript: '#!/bin/bash\nroot-ubuntu.sh',
    });
    expect(instance).toMatchObject({ id: '42', status: 'provisioning', publicIp: '203.0.113.9', currency: 'EUR' });
  });

  it('leaves password auth on when no ssh key is supplied', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(TOKEN)
      .mockResolvedValueOnce(jsonResponse([{ id: 42, name: 'v42', disabled: false, template: null }]))
      .mockResolvedValueOnce(jsonResponse([{ id: 9, name: 'Ubuntu 24.04', alias: 'Ubuntu 24.04' }]))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ id: 42, name: 'v42', disabled: false }));
    vi.stubGlobal('fetch', fetchMock);

    await adapter.provision(ctx(), { kind: 'cpu-vps' }, {});
    const body = JSON.parse(String(fetchMock.mock.calls[3]![1].body));
    expect(body.sshPasswordAuthentication).toBe(true);
    expect(body.sshKeyIds).toBeUndefined();
  });

  it('does not install anything on a dry run', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(TOKEN)
      .mockResolvedValueOnce(jsonResponse([{ id: 42, name: 'v42', disabled: false, template: null }]))
      .mockResolvedValueOnce(jsonResponse([{ id: 9, name: 'Ubuntu 24.04', alias: 'Ubuntu 24.04' }]));
    vi.stubGlobal('fetch', fetchMock);

    const instance = await adapter.provision(ctx({ dryRun: true }), { kind: 'cpu-vps' }, {});
    expect(instance.status).toBe('provisioning');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST' && String(init.body).includes('imageFlavourId'))).toBe(false);
  });

  it('fails loudly on destroy instead of pretending to cancel', async () => {
    await expect(adapter.destroy(ctx(), '42', {}))
      .rejects.toThrow(/no cancel endpoint exists[\s\S]*keeps billing/);
  });

  it('maps live state and location into the instance shape', () => {
    const instance = serverToInstance({
      id: 42, name: 'v42', nickname: 'pit', disabled: false, template: { id: 7, name: 'Ubuntu 24.04' },
      serverLiveInfo: { state: 'OFF', cpuCount: 8, maxServerMemoryInMiB: 16384 },
      ipv4Addresses: [{ id: 1, ip: '203.0.113.9' }],
      site: { id: 2, city: 'Nuremberg' },
      maxCpuCount: 8,
    });
    expect(instance).toMatchObject({
      id: '42', kind: 'cpu-vps', status: 'stopped', publicIp: '203.0.113.9',
      region: 'Nuremberg', sku: 'VPS 2000 G12', currency: 'EUR',
    });
    expect(instance.metadata).toMatchObject({ nickname: 'pit', installed: true });
  });

  it('reports a disabled server as stopped', () => {
    expect(serverToInstance({ id: 1, name: 'v1', disabled: true }).status).toBe('stopped');
  });

  it('prefers an Ubuntu LTS image when none is requested', () => {
    const flavours = [
      { id: 1, name: 'Debian 12', alias: 'Debian 12' },
      { id: 2, name: 'Ubuntu 24.04 LTS', alias: 'Ubuntu 24.04 LTS' },
    ];
    expect(pickImage(flavours)?.id).toBe(2);
    expect(pickImage(flavours, 'debian')?.id).toBe(1);
    expect(pickImage(flavours, 'plan9')).toBeNull();
  });

  it('normalizes hostnames netcup would reject', () => {
    expect(sanitizeHostname('Scrambled Eggs!')).toBe('scrambled-eggs');
    expect(sanitizeHostname('dev.moshcode.sh')).toBe('dev.moshcode.sh');
    expect(sanitizeHostname('!!!')).toBe('sh1pt-host');
  });

  it('surfaces the API error message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(TOKEN)
      .mockResolvedValueOnce({ ok: false, status: 403, text: async () => JSON.stringify({ message: 'ip not allowed' }) }));

    await expect(adapter.status(ctx(), '42', {})).rejects.toThrow(/403 ip not allowed/);
  });

  it('reports an auth failure distinctly from an API failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'invalid_client' }));
    await expect(adapter.list(ctx(), {})).rejects.toThrow(/netcup auth failed: 401/);
  });
});
