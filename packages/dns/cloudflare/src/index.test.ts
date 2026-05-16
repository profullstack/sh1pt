import { afterEach, describe, expect, it, vi } from 'vitest';
import { smokeTest } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'dns' });

afterEach(() => {
  vi.restoreAllMocks();
});

const ctx = (secrets: Record<string, string> = {}) => ({
  secret: (key: string) => secrets[key],
  log: vi.fn(),
});

function cfResponse(result: unknown, resultInfo: Record<string, unknown> = { total_pages: 1 }) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify({ success: true, result, result_info: resultInfo }),
  } as Response;
}

describe('dns-cloudflare', () => {
  it('requires an API token on connect', async () => {
    await expect(adapter.connect(ctx() as any, {})).rejects.toThrow('CLOUDFLARE_API_TOKEN');
  });

  it('lists zones and includes the bearer token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(cfResponse([
      { id: 'zone-1', name: 'example.com' },
    ]));

    await adapter.connect(ctx({ CLOUDFLARE_API_TOKEN: 'cf-token' }) as any, {});
    const zones = await adapter.listZones({ accountId: 'acct-1' });

    expect(zones).toEqual([{ id: 'zone-1', name: 'example.com' }]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones?per_page=100&account.id=acct-1&page=1');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer cf-token' });
  });

  it('maps Cloudflare DNS records into the shared shape', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(cfResponse([
      {
        id: 'rec-1',
        zone_id: 'zone-1',
        zone_name: 'example.com',
        name: 'api.example.com',
        type: 'A',
        content: '192.0.2.10',
        ttl: 120,
        proxied: true,
      },
    ]));

    await adapter.connect(ctx({ CLOUDFLARE_API_TOKEN: 'cf-token' }) as any, {});
    const records = await adapter.listRecords('zone-1', {});

    expect(records).toEqual([{
      id: 'rec-1',
      zone: 'zone-1',
      name: 'api.example.com',
      type: 'A',
      value: '192.0.2.10',
      ttl: 120,
      proxied: true,
    }]);
  });

  it('creates a DNS record when no existing record matches', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(cfResponse([]))
      .mockResolvedValueOnce(cfResponse({ id: 'zone-1', name: 'example.com' }))
      .mockResolvedValueOnce(cfResponse({
        id: 'rec-created',
        zone_id: 'zone-1',
        zone_name: 'example.com',
        name: 'api.example.com',
        type: 'A',
        content: '192.0.2.44',
        ttl: 60,
        proxied: false,
      }));

    await adapter.connect(ctx({ CLOUDFLARE_API_TOKEN: 'cf-token' }) as any, {});
    const record = await adapter.upsertRecord('zone-1', {
      zone: 'zone-1',
      name: 'api',
      type: 'A',
      value: '192.0.2.44',
      ttl: 60,
    }, { defaultProxied: false });

    expect(record.id).toBe('rec-created');
    expect(record.name).toBe('api.example.com');
    const createCall = fetchMock.mock.calls[2]!;
    expect(createCall[0]).toBe('https://api.cloudflare.com/client/v4/zones/zone-1/dns_records');
    expect(JSON.parse(String((createCall[1] as RequestInit).body))).toEqual({
      type: 'A',
      name: 'api.example.com',
      content: '192.0.2.44',
      ttl: 60,
      proxied: false,
    });
  });

  it('updates a DNS record when name and type already exist', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(cfResponse([{
        id: 'rec-1',
        zone_id: 'zone-1',
        zone_name: 'example.com',
        name: 'api.example.com',
        type: 'A',
        content: '192.0.2.10',
        ttl: 120,
      }]))
      .mockResolvedValueOnce(cfResponse({
        id: 'rec-1',
        zone_id: 'zone-1',
        zone_name: 'example.com',
        name: 'api.example.com',
        type: 'A',
        content: '192.0.2.11',
        ttl: 300,
      }));

    await adapter.connect(ctx({ CLOUDFLARE_API_TOKEN: 'cf-token' }) as any, {});
    const record = await adapter.upsertRecord('zone-1', {
      zone: 'zone-1',
      name: 'api',
      type: 'A',
      value: '192.0.2.11',
      ttl: 300,
    }, {});

    expect(record.value).toBe('192.0.2.11');
    const updateCall = fetchMock.mock.calls[1]!;
    expect(updateCall[0]).toBe('https://api.cloudflare.com/client/v4/zones/zone-1/dns_records/rec-1');
    expect((updateCall[1] as RequestInit).method).toBe('PUT');
  });

  it('diffs Cloudflare A records for round-robin sync', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(cfResponse([
        {
          id: 'keep',
          zone_id: 'zone-1',
          zone_name: 'example.com',
          name: 'api.example.com',
          type: 'A',
          content: '192.0.2.10',
          ttl: 120,
        },
        {
          id: 'delete-me',
          zone_id: 'zone-1',
          zone_name: 'example.com',
          name: 'api.example.com',
          type: 'A',
          content: '192.0.2.99',
          ttl: 120,
        },
      ]))
      .mockResolvedValueOnce(cfResponse({ id: 'delete-me' }))
      .mockResolvedValueOnce(cfResponse({
        id: 'created',
        zone_id: 'zone-1',
        zone_name: 'example.com',
        name: 'api.example.com',
        type: 'A',
        content: '192.0.2.11',
        ttl: 60,
        proxied: true,
      }));

    await adapter.connect(ctx({ CLOUDFLARE_API_TOKEN: 'cf-token' }) as any, {});
    const records = await adapter.syncRoundRobin({
      zoneId: 'zone-1',
      name: 'api',
      ips: ['192.0.2.10', '192.0.2.11'],
      ttl: 60,
      proxied: true,
    }, {});

    expect(records.map((record) => record.value)).toEqual(['192.0.2.10', '192.0.2.11']);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.cloudflare.com/client/v4/zones/zone-1/dns_records/delete-me');
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe('DELETE');
    const createCall = fetchMock.mock.calls[2]!;
    expect(JSON.parse(String((createCall[1] as RequestInit).body))).toMatchObject({
      type: 'A',
      name: 'api.example.com',
      content: '192.0.2.11',
      ttl: 60,
      proxied: true,
    });
  });

  it('surfaces Cloudflare API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => JSON.stringify({ success: false, errors: [{ message: 'token does not have permission' }] }),
    } as Response);

    await adapter.connect(ctx({ CLOUDFLARE_API_TOKEN: 'cf-token' }) as any, {});
    await expect(adapter.listRecords('zone-1', {})).rejects.toThrow('Cloudflare 403: token does not have permission');
  });
});
