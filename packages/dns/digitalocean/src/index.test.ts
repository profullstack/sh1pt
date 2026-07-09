import { contractTestDns } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import dns from './index.js';

contractTestDns(dns, {
  sampleConfig: {},
  requiredSecrets: ['DO_API_TOKEN'],
});

const ctx = (secrets: Record<string, string> = { DO_API_TOKEN: 'do_test_token' }) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 400) => ({
  ok,
  status,
  text: async () => JSON.stringify(body),
});

describe('DigitalOcean DNS API adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a DigitalOcean API token', async () => {
    await expect(dns.connect(ctx({}), {})).rejects.toThrow('DO_API_TOKEN');
  });

  it('lists domains as zones', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      domains: [
        { name: 'example.com' },
        { name: 'example.net' },
      ],
      links: {},
    }));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    const zones = await dns.listZones({});

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.digitalocean.com/v2/domains?per_page=200',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer do_test_token' }),
      }),
    );
    expect(zones).toEqual([
      { id: 'example.com', name: 'example.com' },
      { id: 'example.net', name: 'example.net' },
    ]);
  });

  it('follows DigitalOcean pagination links', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        domains: [{ name: 'example.com' }],
        links: { pages: { next: 'https://api.digitalocean.com/v2/domains?page=2' } },
      }))
      .mockResolvedValueOnce(jsonResponse({
        domains: [{ name: 'example.org' }],
        links: {},
      }));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    const zones = await dns.listZones({});

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'https://api.digitalocean.com/v2/domains?per_page=200',
      'https://api.digitalocean.com/v2/domains?page=2',
    ]);
    expect(zones).toEqual([
      { id: 'example.com', name: 'example.com' },
      { id: 'example.org', name: 'example.org' },
    ]);
  });

  it('maps DigitalOcean records into sh1pt DNS records', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      domain_records: [
        { id: 10, name: '@', type: 'A', data: '1.2.3.4', ttl: 600 },
        { id: 11, name: 'www', type: 'CNAME', data: 'example.net', ttl: null },
        { id: 12, name: 'api.v1', type: 'TXT', data: 'hello', ttl: 300 },
      ],
      links: {},
    })));

    await dns.connect(ctx(), {});
    const records = await dns.listRecords('example.com', { defaultTtl: 900 });

    expect(records).toEqual([
      { id: '10', zone: 'example.com', name: 'example.com', type: 'A', value: '1.2.3.4', ttl: 600 },
      { id: '11', zone: 'example.com', name: 'www.example.com', type: 'CNAME', value: 'example.net', ttl: 900 },
      { id: '12', zone: 'example.com', name: 'api.v1.example.com', type: 'TXT', value: 'hello', ttl: 300 },
    ]);
  });

  it('creates a record when no matching name and type exists', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        domain_records: [],
        links: {},
      }))
      .mockResolvedValueOnce(jsonResponse({
        domain_record: { id: 55, name: 'www', type: 'A', data: '1.2.3.4', ttl: 600 },
      }, true, 201));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    const record = await dns.upsertRecord('example.com', {
      zone: 'example.com',
      name: 'www.example.com',
      type: 'A',
      value: '1.2.3.4',
      ttl: 600,
    }, {});

    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.digitalocean.com/v2/domains/example.com/records');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1].body))).toEqual({
      type: 'A',
      name: 'www',
      data: '1.2.3.4',
      ttl: 600,
    });
    expect(record).toEqual({
      id: '55',
      zone: 'example.com',
      name: 'www.example.com',
      type: 'A',
      value: '1.2.3.4',
      ttl: 600,
    });
  });

  it('updates an existing matching record during upsert', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        domain_records: [{ id: 77, name: 'api', type: 'A', data: '1.1.1.1', ttl: 300 }],
        links: {},
      }))
      .mockResolvedValueOnce(jsonResponse({
        domain_record: { id: 77, name: 'api', type: 'A', data: '2.2.2.2', ttl: 900 },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    const record = await dns.upsertRecord('example.com', {
      zone: 'example.com',
      name: 'api',
      type: 'A',
      value: '2.2.2.2',
      ttl: 900,
    }, {});

    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.digitalocean.com/v2/domains/example.com/records/77');
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'PUT' });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1].body))).toEqual({
      type: 'A',
      name: 'api',
      data: '2.2.2.2',
      ttl: 900,
    });
    expect(record).toMatchObject({ id: '77', name: 'api.example.com', value: '2.2.2.2', ttl: 900 });
  });

  it('diffs round-robin A records without disturbing unrelated records', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        domain_records: [
          { id: 1, name: 'api', type: 'A', data: '1.1.1.1', ttl: 300 },
          { id: 2, name: 'api', type: 'A', data: '1.1.1.1', ttl: 300 },
          { id: 3, name: 'api', type: 'A', data: '2.2.2.2', ttl: 300 },
          { id: 4, name: 'api', type: 'TXT', data: 'keep', ttl: 300 },
        ],
        links: {},
      }))
      .mockResolvedValueOnce(jsonResponse({
        domain_record: { id: 1, name: 'api', type: 'A', data: '1.1.1.1', ttl: 600 },
      }))
      .mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' })
      .mockResolvedValueOnce(jsonResponse({
        domain_record: { id: 5, name: 'api', type: 'A', data: '3.3.3.3', ttl: 600 },
      }, true, 201));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    const synced = await dns.syncRoundRobin({
      zoneId: 'example.com',
      name: 'api',
      ips: ['1.1.1.1', '3.3.3.3'],
      ttl: 600,
    }, {});

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'https://api.digitalocean.com/v2/domains/example.com/records?per_page=200',
      'https://api.digitalocean.com/v2/domains/example.com/records/1',
      'https://api.digitalocean.com/v2/domains/example.com/records/2',
      'https://api.digitalocean.com/v2/domains/example.com/records/3',
      'https://api.digitalocean.com/v2/domains/example.com/records',
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[4]?.[1].body))).toMatchObject({
      type: 'A',
      name: 'api',
      data: '3.3.3.3',
      ttl: 600,
    });
    expect(synced.map((record) => record.value)).toEqual(['1.1.1.1', '3.3.3.3']);
  });

  it('uses custom base URLs without duplicate slashes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      domain_records: [],
      links: {},
    }));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    await dns.listRecords('example.com', {
      baseUrl: 'https://do-proxy.test/v2/',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://do-proxy.test/v2/domains/example.com/records?per_page=200');
  });

  it('surfaces DigitalOcean API error details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      id: 'Unauthorized',
      message: 'Unable to authenticate you.',
    }, false, 401)));

    await dns.connect(ctx(), {});
    await expect(dns.listZones({})).rejects.toThrow('DigitalOcean 401: Unable to authenticate you.');
  });
});
