import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'dns' });

const ctx = (secrets: Record<string, string> = { CLOUDFLARE_API_TOKEN: 'cf-token' }) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

const cfResponse = <T>(result: T, status = 200, resultInfo?: { page?: number; total_pages?: number }) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => ({ result, result_info: resultInfo }),
  text: async () => JSON.stringify({ result }),
});

const cfError = (status: number, message: string) => ({
  ok: false,
  status,
  text: async () => message,
});

function requestBody(call: unknown[]): Record<string, unknown> {
  const request = call[1] as { body?: string };
  return JSON.parse(request.body ?? '{}') as Record<string, unknown>;
}

describe('Cloudflare DNS API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a Cloudflare API token on connect', async () => {
    await expect(adapter.connect(ctx({}) as any, {})).rejects.toThrow(/CLOUDFLARE_API_TOKEN/);
  });

  it('lists zones with optional account filter and pagination', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(cfResponse([{ id: 'zone-1', name: 'example.com' }], 200, { page: 1, total_pages: 2 }))
      .mockResolvedValueOnce(cfResponse([{ id: 'zone-2', name: 'example.dev' }], 200, { page: 2, total_pages: 2 }));
    vi.stubGlobal('fetch', fetchMock);

    await adapter.connect(ctx() as any, {});
    const zones = await adapter.listZones({ accountId: 'acct-1' });

    expect(zones).toEqual([
      { id: 'zone-1', name: 'example.com' },
      { id: 'zone-2', name: 'example.dev' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('account.id=acct-1');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('page=2');
    expect((fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> }).headers.authorization).toBe('Bearer cf-token');
  });

  it('lists DNS records and maps Cloudflare content fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(cfResponse([
      { id: 'rec-1', name: 'api.example.com', type: 'A', content: '1.2.3.4', ttl: 120, proxied: true },
    ])));

    await adapter.connect(ctx() as any, {});
    const records = await adapter.listRecords('zone-1', {});

    expect(records).toEqual([
      { id: 'rec-1', zone: 'zone-1', name: 'api.example.com', type: 'A', value: '1.2.3.4', ttl: 120, proxied: true },
    ]);
  });

  it('updates an existing record during upsert', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(cfResponse([
        { id: 'rec-1', name: 'api.example.com', type: 'A', content: '1.2.3.4', ttl: 120, proxied: false },
      ]))
      .mockResolvedValueOnce(cfResponse({
        id: 'rec-1',
        name: 'api.example.com',
        type: 'A',
        content: '5.6.7.8',
        ttl: 60,
        proxied: true,
      }));
    vi.stubGlobal('fetch', fetchMock);

    await adapter.connect(ctx() as any, {});
    const updated = await adapter.upsertRecord('zone-1', {
      zone: 'zone-1',
      name: 'api.example.com',
      type: 'A',
      value: '5.6.7.8',
      ttl: 60,
      proxied: true,
    }, {});

    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.cloudflare.com/client/v4/zones/zone-1/dns_records/rec-1');
    expect((fetchMock.mock.calls[1]?.[1] as { method: string }).method).toBe('PATCH');
    expect(requestBody(fetchMock.mock.calls[1] ?? [])).toEqual({
      type: 'A',
      name: 'api.example.com',
      content: '5.6.7.8',
      ttl: 60,
      proxied: true,
    });
    expect(updated.value).toBe('5.6.7.8');
  });

  it('creates a record during upsert when no match exists', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(cfResponse([]))
      .mockResolvedValueOnce(cfResponse({
        id: 'rec-new',
        name: 'www.example.com',
        type: 'CNAME',
        content: 'target.example.net',
        ttl: 300,
        proxied: false,
      }));
    vi.stubGlobal('fetch', fetchMock);

    await adapter.connect(ctx() as any, {});
    const created = await adapter.upsertRecord('zone-1', {
      zone: 'zone-1',
      name: 'www.example.com',
      type: 'CNAME',
      value: 'target.example.net',
      ttl: 300,
    }, {});

    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.cloudflare.com/client/v4/zones/zone-1/dns_records');
    expect((fetchMock.mock.calls[1]?.[1] as { method: string }).method).toBe('POST');
    expect(created.id).toBe('rec-new');
  });

  it('deletes records and treats missing records as already gone', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(cfResponse({ id: 'rec-1' }))
      .mockResolvedValueOnce(cfError(404, 'not found'));
    vi.stubGlobal('fetch', fetchMock);

    await adapter.connect(ctx() as any, {});
    await adapter.deleteRecord('zone-1', 'rec-1', {});
    await adapter.deleteRecord('zone-1', 'already-gone', {});

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0]?.[1] as { method: string }).method).toBe('DELETE');
  });

  it('syncs round-robin A records by updating kept IPs, deleting extras, and creating missing IPs', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(cfResponse([
        { id: 'keep', name: 'api.example.com', type: 'A', content: '1.1.1.1', ttl: 300, proxied: false },
        { id: 'delete', name: 'api.example.com', type: 'A', content: '9.9.9.9', ttl: 300, proxied: false },
        { id: 'txt', name: 'api.example.com', type: 'TXT', content: 'leave-me', ttl: 300 },
      ]))
      .mockResolvedValueOnce(cfResponse({
        id: 'keep',
        name: 'api.example.com',
        type: 'A',
        content: '1.1.1.1',
        ttl: 60,
        proxied: true,
      }))
      .mockResolvedValueOnce(cfResponse({ id: 'delete' }))
      .mockResolvedValueOnce(cfResponse({
        id: 'created',
        name: 'api.example.com',
        type: 'A',
        content: '2.2.2.2',
        ttl: 60,
        proxied: true,
      }));
    vi.stubGlobal('fetch', fetchMock);

    await adapter.connect(ctx() as any, {});
    const records = await adapter.syncRoundRobin({
      zoneId: 'zone-1',
      name: 'api.example.com',
      ips: ['1.1.1.1', '2.2.2.2'],
      ttl: 60,
      proxied: true,
    }, {});

    expect(records.map(record => record.value)).toEqual(['1.1.1.1', '2.2.2.2']);
    expect((fetchMock.mock.calls[1]?.[1] as { method: string }).method).toBe('PATCH');
    expect((fetchMock.mock.calls[2]?.[1] as { method: string }).method).toBe('DELETE');
    expect((fetchMock.mock.calls[3]?.[1] as { method: string }).method).toBe('POST');
  });

  it('surfaces status and response body on Cloudflare failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(cfError(403, 'missing DNS Write')));

    await adapter.connect(ctx() as any, {});
    await expect(adapter.listRecords('zone-1', {})).rejects.toThrow(/Cloudflare listRecords: 403 missing DNS Write/);
  });
});
