import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import dns from './index.js';

smokeTest(dns, { idPrefix: 'dns' });

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify({ status: 'SUCCESS', ...body }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ctx = (secrets: Record<string, string> = {
  PORKBUN_API_KEY: 'pk-test',
  PORKBUN_API_SECRET: 'sk-test',
}) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

function request(index: number, fetchMock: any) {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return { url, init, body: JSON.parse(String(init.body ?? '{}')) as Record<string, unknown> };
}

describe('Porkbun DNS API adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires Porkbun credentials on connect', async () => {
    await expect(dns.connect(ctx({}) as any, {})).rejects.toThrow(/PORKBUN_API_KEY/);
  });

  it('lists records through the Porkbun retrieve endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({
      records: [
        { id: '1', name: 'api.example.com', type: 'A', content: '203.0.113.10', ttl: '600' },
        { id: '2', name: 'example.com', type: 'NS', content: 'ns1.example.com', ttl: '600' },
      ],
    }));

    await dns.connect(ctx() as any, {});
    await expect(dns.listRecords('example.com', {})).resolves.toEqual([
      { id: '1', zone: 'example.com', name: 'api.example.com', type: 'A', value: '203.0.113.10', ttl: 600 },
    ]);
    expect(request(0, fetchMock).url).toBe('https://api.porkbun.com/api/json/v3/dns/retrieve/example.com');
    expect(request(0, fetchMock).body).toMatchObject({
      apikey: 'pk-test',
      secretapikey: 'sk-test',
    });
  });

  it('creates a DNS record when no matching name/type exists', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok({ records: [] }))
      .mockResolvedValueOnce(ok({ id: 42 }));

    await dns.connect(ctx() as any, {});
    await expect(dns.upsertRecord('example.com', {
      zone: 'example.com',
      name: 'api.example.com',
      type: 'A',
      value: '203.0.113.10',
      ttl: 120,
    }, {})).resolves.toMatchObject({
      id: '42',
      name: 'api.example.com',
      type: 'A',
      value: '203.0.113.10',
      ttl: 120,
    });

    expect(request(1, fetchMock).url).toBe('https://api.porkbun.com/api/json/v3/dns/create/example.com');
    expect(request(1, fetchMock).body).toMatchObject({
      name: 'api',
      type: 'A',
      content: '203.0.113.10',
      ttl: 120,
    });
  });

  it('edits a DNS record when a matching name/type exists', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok({
        records: [
          { id: 'record-1', name: 'api.example.com', type: 'A', content: '203.0.113.9', ttl: '600' },
        ],
      }))
      .mockResolvedValueOnce(ok({}));

    await dns.connect(ctx() as any, {});
    const updated = await dns.upsertRecord('example.com', {
      zone: 'example.com',
      name: 'api.example.com',
      type: 'A',
      value: '203.0.113.10',
      ttl: 300,
    }, {});

    expect(updated.id).toBe('record-1');
    expect(request(1, fetchMock).url).toBe('https://api.porkbun.com/api/json/v3/dns/edit/example.com/record-1');
    expect(request(1, fetchMock).body).toMatchObject({
      name: 'api',
      type: 'A',
      content: '203.0.113.10',
      ttl: 300,
    });
  });

  it('deletes records by provider id', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({}));

    await dns.connect(ctx() as any, {});
    await dns.deleteRecord('example.com', 'record-1', {});

    expect(request(0, fetchMock).url).toBe('https://api.porkbun.com/api/json/v3/dns/delete/example.com/record-1');
  });

  it('syncs round-robin A records by deleting extras, editing TTLs, and creating missing IPs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok({
        records: [
          { id: 'keep', name: 'api.example.com', type: 'A', content: '203.0.113.10', ttl: '600' },
          { id: 'duplicate', name: 'api.example.com', type: 'A', content: '203.0.113.10', ttl: '600' },
          { id: 'extra', name: 'api.example.com', type: 'A', content: '203.0.113.99', ttl: '600' },
        ],
      }))
      .mockResolvedValueOnce(ok({}))
      .mockResolvedValueOnce(ok({}))
      .mockResolvedValueOnce(ok({}))
      .mockResolvedValueOnce(ok({ id: 77 }));

    await dns.connect(ctx() as any, {});
    const records = await dns.syncRoundRobin({
      zoneId: 'example.com',
      name: 'api.example.com',
      ips: ['203.0.113.10', '203.0.113.10', '203.0.113.11'],
      ttl: 120,
    }, {});

    expect(records.map(record => record.value)).toEqual(['203.0.113.10', '203.0.113.11']);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.porkbun.com/api/json/v3/dns/retrieve/example.com',
      'https://api.porkbun.com/api/json/v3/dns/delete/example.com/duplicate',
      'https://api.porkbun.com/api/json/v3/dns/delete/example.com/extra',
      'https://api.porkbun.com/api/json/v3/dns/edit/example.com/keep',
      'https://api.porkbun.com/api/json/v3/dns/create/example.com',
    ]);
    expect(request(3, fetchMock).body).toMatchObject({ name: 'api', content: '203.0.113.10', ttl: 120 });
    expect(request(4, fetchMock).body).toMatchObject({ name: 'api', content: '203.0.113.11', ttl: 120 });
  });

  it('surfaces Porkbun API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ status: 'ERROR', message: 'bad key' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));

    await dns.connect(ctx() as any, {});
    await expect(dns.listRecords('example.com', {})).rejects.toThrow(/bad key/);
  });
});
