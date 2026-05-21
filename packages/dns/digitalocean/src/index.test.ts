import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import dns from './index.js';

smokeTest(dns, { idPrefix: 'dns' });

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ctx = (secrets: Record<string, string> = { DO_API_TOKEN: 'do-token' }) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

function request(index: number, fetchMock: any) {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return {
    url,
    init,
    body: init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined,
  };
}

describe('DigitalOcean DNS API adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires a DigitalOcean token on connect', async () => {
    await expect(dns.connect(ctx({}) as any, {})).rejects.toThrow(/DO_API_TOKEN/);
  });

  it('lists zones through the domains endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({
      domains: [{ name: 'example.com' }, { name: 'example.net' }],
    }));

    await dns.connect(ctx() as any, {});
    await expect(dns.listZones({})).resolves.toEqual([
      { id: 'example.com', name: 'example.com' },
      { id: 'example.net', name: 'example.net' },
    ]);
    expect(request(0, fetchMock).url).toBe('https://api.digitalocean.com/v2/domains');
    expect(request(0, fetchMock).init.headers).toMatchObject({
      Authorization: 'Bearer do-token',
    });
  });

  it('lists records through the records endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({
      domain_records: [
        { id: 1, name: '@', type: 'A', data: '203.0.113.10', ttl: 1800 },
        { id: 2, name: 'api', type: 'A', data: '203.0.113.11', ttl: 300 },
      ],
    }));

    await dns.connect(ctx() as any, {});
    await expect(dns.listRecords('example.com', {})).resolves.toEqual([
      { id: '1', zone: 'example.com', name: 'example.com', type: 'A', value: '203.0.113.10', ttl: 1800 },
      { id: '2', zone: 'example.com', name: 'api.example.com', type: 'A', value: '203.0.113.11', ttl: 300 },
    ]);
  });

  it('creates a DNS record when no matching name/type exists', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok({ domain_records: [] }))
      .mockResolvedValueOnce(ok({ domain_record: { id: 42 } }));

    await dns.connect(ctx() as any, {});
    const created = await dns.upsertRecord('example.com', {
      zone: 'example.com',
      name: 'api.example.com',
      type: 'A',
      value: '203.0.113.10',
      ttl: 120,
    }, {});

    expect(created.id).toBe('42');
    expect(request(1, fetchMock).url).toBe('https://api.digitalocean.com/v2/domains/example.com/records');
    expect(request(1, fetchMock).body).toEqual({
      type: 'A',
      name: 'api',
      data: '203.0.113.10',
      ttl: 120,
    });
  });

  it('updates a DNS record when a matching name/type exists', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok({
        domain_records: [
          { id: 1, name: 'api', type: 'A', data: '203.0.113.9', ttl: 1800 },
        ],
      }))
      .mockResolvedValueOnce(ok({}));

    await dns.connect(ctx() as any, {});
    const updated = await dns.upsertRecord('example.com', {
      zone: 'example.com',
      name: 'api.example.com',
      type: 'A',
      value: '203.0.113.10',
      ttl: 120,
    }, {});

    expect(updated.id).toBe('1');
    expect(request(1, fetchMock).url).toBe('https://api.digitalocean.com/v2/domains/example.com/records/1');
    expect(request(1, fetchMock).init.method).toBe('PUT');
    expect(request(1, fetchMock).body).toEqual({ data: '203.0.113.10', ttl: 120 });
  });

  it('syncs round-robin A records by deleting extras, updating TTLs, and creating missing IPs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok({
        domain_records: [
          { id: 1, name: 'api', type: 'A', data: '203.0.113.10', ttl: 1800 },
          { id: 2, name: 'api', type: 'A', data: '203.0.113.10', ttl: 1800 },
          { id: 3, name: 'api', type: 'A', data: '203.0.113.99', ttl: 1800 },
        ],
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(ok({}))
      .mockResolvedValueOnce(ok({ domain_record: { id: 4 } }));

    await dns.connect(ctx() as any, {});
    const records = await dns.syncRoundRobin({
      zoneId: 'example.com',
      name: 'api.example.com',
      ips: ['203.0.113.10', '203.0.113.10', '203.0.113.11'],
      ttl: 300,
    }, {});

    expect(records.map(record => record.value)).toEqual(['203.0.113.10', '203.0.113.11']);
    expect(fetchMock.mock.calls.map(([url, init]) => [String(url), init?.method ?? 'GET'])).toEqual([
      ['https://api.digitalocean.com/v2/domains/example.com/records?per_page=200', 'GET'],
      ['https://api.digitalocean.com/v2/domains/example.com/records/2', 'DELETE'],
      ['https://api.digitalocean.com/v2/domains/example.com/records/3', 'DELETE'],
      ['https://api.digitalocean.com/v2/domains/example.com/records/1', 'PUT'],
      ['https://api.digitalocean.com/v2/domains/example.com/records', 'POST'],
    ]);
    expect(request(3, fetchMock).body).toEqual({ data: '203.0.113.10', ttl: 300 });
    expect(request(4, fetchMock).body).toEqual({
      type: 'A',
      name: 'api',
      data: '203.0.113.11',
      ttl: 300,
    });
  });
});
