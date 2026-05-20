import { contractTestDns } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import dns from './index.js';

contractTestDns(dns, {
  sampleConfig: {},
  requiredSecrets: ['DNSIMPLE_API_TOKEN'],
});

const ctx = (secrets: Record<string, string> = { DNSIMPLE_API_TOKEN: 'dnsimple_test_token' }) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 400) => ({
  ok,
  status,
  text: async () => JSON.stringify(body),
});

describe('DNSimple DNS API adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a DNSimple API token', async () => {
    await expect(dns.connect(ctx({}), {})).rejects.toThrow('DNSIMPLE_API_TOKEN');
  });

  it('lists zones using a configured account id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [
        { id: 1, name: 'example.com' },
        { id: 2, name: 'example.net' },
      ],
      pagination: { current_page: 1, total_pages: 1 },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    const zones = await dns.listZones({ accountId: '1010' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.dnsimple.com/v2/1010/zones?per_page=100&page=1',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer dnsimple_test_token' }),
      }),
    );
    expect(zones).toEqual([
      { id: 'example.com', name: 'example.com' },
      { id: 'example.net', name: 'example.net' },
    ]);
  });

  it('resolves account id through whoami when config omits it', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { account: { id: 2020 } } }))
      .mockResolvedValueOnce(jsonResponse({
        data: [{ id: 1, name: 'example.com' }],
        pagination: { current_page: 1, total_pages: 1 },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    await expect(dns.listZones({})).resolves.toEqual([{ id: 'example.com', name: 'example.com' }]);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'https://api.dnsimple.com/v2/whoami',
      'https://api.dnsimple.com/v2/2020/zones?per_page=100&page=1',
    ]);
  });

  it('maps DNSimple records into sh1pt DNS records', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [
        { id: 10, name: '', type: 'A', content: '1.2.3.4', ttl: 600 },
        { id: 11, name: 'www', type: 'CNAME', content: 'example.net', ttl: null },
        { id: 12, name: 'api.v1', type: 'TXT', content: 'hello', ttl: 300 },
      ],
      pagination: { current_page: 1, total_pages: 1 },
    })));

    await dns.connect(ctx(), {});
    const records = await dns.listRecords('example.com', { accountId: '1010', defaultTtl: 900 });

    expect(records).toEqual([
      { id: '10', zone: 'example.com', name: 'example.com', type: 'A', value: '1.2.3.4', ttl: 600 },
      { id: '11', zone: 'example.com', name: 'www.example.com', type: 'CNAME', value: 'example.net', ttl: 900 },
      { id: '12', zone: 'example.com', name: 'api.v1.example.com', type: 'TXT', value: 'hello', ttl: 300 },
    ]);
  });

  it('creates a record when no matching name and type exists', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: [],
        pagination: { current_page: 1, total_pages: 1 },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: { id: 55, name: 'www', type: 'A', content: '1.2.3.4', ttl: 600 },
      }, true, 201));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    const record = await dns.upsertRecord('example.com', {
      zone: 'example.com',
      name: 'www.example.com',
      type: 'A',
      value: '1.2.3.4',
      ttl: 600,
    }, { accountId: '1010' });

    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.dnsimple.com/v2/1010/zones/example.com/records');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1].body))).toEqual({
      name: 'www',
      type: 'A',
      content: '1.2.3.4',
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
        data: [{ id: 77, name: 'api', type: 'A', content: '1.1.1.1', ttl: 300 }],
        pagination: { current_page: 1, total_pages: 1 },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: { id: 77, name: 'api', type: 'A', content: '2.2.2.2', ttl: 900 },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    const record = await dns.upsertRecord('example.com', {
      zone: 'example.com',
      name: 'api',
      type: 'A',
      value: '2.2.2.2',
      ttl: 900,
    }, { accountId: '1010' });

    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.dnsimple.com/v2/1010/zones/example.com/records/77');
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'PATCH' });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1].body))).toEqual({
      name: 'api',
      content: '2.2.2.2',
      ttl: 900,
    });
    expect(record).toMatchObject({ id: '77', name: 'api.example.com', value: '2.2.2.2', ttl: 900 });
  });

  it('diffs round-robin A records without disturbing unrelated records', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: [
          { id: 1, name: 'api', type: 'A', content: '1.1.1.1', ttl: 300 },
          { id: 2, name: 'api', type: 'A', content: '1.1.1.1', ttl: 300 },
          { id: 3, name: 'api', type: 'A', content: '2.2.2.2', ttl: 300 },
          { id: 4, name: 'api', type: 'TXT', content: 'keep', ttl: 300 },
        ],
        pagination: { current_page: 1, total_pages: 1 },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: { id: 1, name: 'api', type: 'A', content: '1.1.1.1', ttl: 600 },
      }))
      .mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' })
      .mockResolvedValueOnce(jsonResponse({
        data: { id: 5, name: 'api', type: 'A', content: '3.3.3.3', ttl: 600 },
      }, true, 201));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    const synced = await dns.syncRoundRobin({
      zoneId: 'example.com',
      name: 'api',
      ips: ['1.1.1.1', '3.3.3.3'],
      ttl: 600,
    }, { accountId: '1010' });

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'https://api.dnsimple.com/v2/1010/zones/example.com/records?per_page=100&page=1',
      'https://api.dnsimple.com/v2/1010/zones/example.com/records/1',
      'https://api.dnsimple.com/v2/1010/zones/example.com/records/2',
      'https://api.dnsimple.com/v2/1010/zones/example.com/records/3',
      'https://api.dnsimple.com/v2/1010/zones/example.com/records',
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[4]?.[1].body))).toMatchObject({
      name: 'api',
      type: 'A',
      content: '3.3.3.3',
      ttl: 600,
    });
    expect(synced.map((record) => record.value)).toEqual(['1.1.1.1', '3.3.3.3']);
  });

  it('uses custom base URLs without duplicate slashes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [],
      pagination: { current_page: 1, total_pages: 1 },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    await dns.listRecords('example.com', {
      accountId: '1010',
      baseUrl: 'https://dnsimple-proxy.test/v2/',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://dnsimple-proxy.test/v2/1010/zones/example.com/records?per_page=100&page=1');
  });

  it('surfaces DNSimple API error details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      message: 'Authentication failed',
    }, false, 401)));

    await dns.connect(ctx(), {});
    await expect(dns.listZones({ accountId: '1010' }))
      .rejects.toThrow('DNSimple 401: Authentication failed');
  });
});
