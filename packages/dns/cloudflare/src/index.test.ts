import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'dns' });

function ok<T>(result: T, result_info?: unknown) {
  return new Response(JSON.stringify({ success: true, result, result_info }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function connect() {
  await adapter.connect({ secret: () => 'cf-token', log: () => {} }, {});
}

describe('Cloudflare DNS API adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connect() asks for a vault token when credentials are missing', async () => {
    await expect(adapter.connect({ secret: () => undefined, log: () => {} }, {})).rejects.toThrow(
      'CLOUDFLARE_API_TOKEN',
    );
  });

  it('lists zones through the Cloudflare zones endpoint', async () => {
    await connect();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok([
      { id: 'zone-1', name: 'example.com' },
      { id: 'zone-2', name: 'example.net' },
    ], { page: 1, per_page: 100, total_pages: 1, total_count: 2 }));

    await expect(adapter.listZones({})).resolves.toEqual([
      { id: 'zone-1', name: 'example.com' },
      { id: 'zone-2', name: 'example.net' },
    ]);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/zones?page=1&per_page=100');
    expect(fetchMock.mock.calls[0]![1]?.headers).toMatchObject({
      Authorization: 'Bearer cf-token',
    });
  });

  it('creates a DNS record when no matching name/type exists', async () => {
    await connect();
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok([], { page: 1, per_page: 100, total_pages: 1, total_count: 0 }))
      .mockResolvedValueOnce(ok({
        id: 'record-1',
        zone_id: 'zone-1',
        name: 'api.example.com',
        type: 'A',
        content: '203.0.113.10',
        ttl: 120,
        proxied: true,
      }));

    await expect(adapter.upsertRecord('zone-1', {
      zone: 'zone-1',
      name: 'api.example.com',
      type: 'A',
      value: '203.0.113.10',
      ttl: 120,
      proxied: true,
    }, {})).resolves.toMatchObject({
      id: 'record-1',
      name: 'api.example.com',
      value: '203.0.113.10',
      ttl: 120,
      proxied: true,
    });

    expect(fetchMock.mock.calls[1]![1]?.method).toBe('POST');
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body))).toEqual({
      type: 'A',
      name: 'api.example.com',
      content: '203.0.113.10',
      ttl: 120,
      proxied: true,
    });
  });

  it('updates a DNS record when name/type already exists', async () => {
    await connect();
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok([
        {
          id: 'record-1',
          zone_id: 'zone-1',
          name: 'api.example.com',
          type: 'A',
          content: '203.0.113.9',
          ttl: 120,
          proxied: false,
        },
      ], { page: 1, per_page: 100, total_pages: 1, total_count: 1 }))
      .mockResolvedValueOnce(ok({
        id: 'record-1',
        zone_id: 'zone-1',
        name: 'api.example.com',
        type: 'A',
        content: '203.0.113.10',
        ttl: 60,
        proxied: false,
      }));

    const updated = await adapter.upsertRecord('zone-1', {
      zone: 'zone-1',
      name: 'api.example.com',
      type: 'A',
      value: '203.0.113.10',
      ttl: 60,
    }, {});

    expect(updated.value).toBe('203.0.113.10');
    expect(fetchMock.mock.calls[1]![0]).toBe(`${'https://api.cloudflare.com/client/v4'}/zones/zone-1/dns_records/record-1`);
    expect(fetchMock.mock.calls[1]![1]?.method).toBe('PUT');
  });

  it('syncs round-robin A records by updating kept records, creating missing IPs, and deleting extras', async () => {
    await connect();
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok([
        {
          id: 'keep',
          zone_id: 'zone-1',
          name: 'api.example.com',
          type: 'A',
          content: '203.0.113.10',
          ttl: 120,
          proxied: false,
        },
        {
          id: 'duplicate',
          zone_id: 'zone-1',
          name: 'api.example.com',
          type: 'A',
          content: '203.0.113.10',
          ttl: 120,
          proxied: false,
        },
        {
          id: 'extra',
          zone_id: 'zone-1',
          name: 'api.example.com',
          type: 'A',
          content: '203.0.113.99',
          ttl: 120,
          proxied: false,
        },
      ], { page: 1, per_page: 100, total_pages: 1, total_count: 3 }))
      .mockResolvedValueOnce(ok({ id: 'duplicate' }))
      .mockResolvedValueOnce(ok({ id: 'extra' }))
      .mockResolvedValueOnce(ok({
        id: 'keep',
        zone_id: 'zone-1',
        name: 'api.example.com',
        type: 'A',
        content: '203.0.113.10',
        ttl: 60,
        proxied: true,
      }))
      .mockResolvedValueOnce(ok({
        id: 'created',
        zone_id: 'zone-1',
        name: 'api.example.com',
        type: 'A',
        content: '203.0.113.11',
        ttl: 60,
        proxied: true,
      }));

    const records = await adapter.syncRoundRobin({
      zoneId: 'zone-1',
      name: 'api.example.com',
      ips: ['203.0.113.10', '203.0.113.11'],
      ttl: 60,
      proxied: true,
    }, {});

    expect(records.map((record) => record.value)).toEqual(['203.0.113.10', '203.0.113.11']);
    expect(fetchMock.mock.calls.map(([url, init]) => [String(url), init?.method ?? 'GET'])).toEqual([
      ['https://api.cloudflare.com/client/v4/zones/zone-1/dns_records?page=1&per_page=100', 'GET'],
      ['https://api.cloudflare.com/client/v4/zones/zone-1/dns_records/duplicate', 'DELETE'],
      ['https://api.cloudflare.com/client/v4/zones/zone-1/dns_records/extra', 'DELETE'],
      ['https://api.cloudflare.com/client/v4/zones/zone-1/dns_records/keep', 'PUT'],
      ['https://api.cloudflare.com/client/v4/zones/zone-1/dns_records', 'POST'],
    ]);
  });
});
