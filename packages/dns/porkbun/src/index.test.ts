import { contractTestDns } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import dns from './index.js';

contractTestDns(dns, {
  sampleConfig: {},
  requiredSecrets: ['PORKBUN_API_KEY', 'PORKBUN_API_SECRET'],
});

const ctx = (secrets: Record<string, string> = {
  PORKBUN_API_KEY: 'pk_test',
  PORKBUN_API_SECRET: 'sk_test',
}) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

describe('Porkbun DNS API adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires both Porkbun API credentials', async () => {
    await expect(dns.connect(ctx({ PORKBUN_API_KEY: 'pk_test' }), {}))
      .rejects.toThrow('PORKBUN_API_KEY / PORKBUN_API_SECRET');
  });

  it('maps retrieved Porkbun DNS records into sh1pt DNS records', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        status: 'SUCCESS',
        records: [
          { id: '123', name: 'www.example.com', type: 'A', content: '1.2.3.4', ttl: '600' },
          { id: '124', name: 'example.com', type: 'TXT', content: 'hello', ttl: null },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    const records = await dns.listRecords('example.com', { defaultTtl: 900 });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.porkbun.com/api/json/v3/dns/retrieve/example.com',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toMatchObject({
      apikey: 'pk_test',
      secretapikey: 'sk_test',
    });
    expect(records).toEqual([
      { id: '123', zone: 'example.com', name: 'www.example.com', type: 'A', value: '1.2.3.4', ttl: 600 },
      { id: '124', zone: 'example.com', name: 'example.com', type: 'TXT', value: 'hello', ttl: 900 },
    ]);
  });

  it('lists API-enabled domains as zones', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        status: 'SUCCESS',
        count: 2,
        domains: [
          { domain: 'example.com', apiAccess: 1 },
          { domain: 'example.net', apiAccess: 1 },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    const zones = await dns.listZones({});

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.porkbun.com/api/json/v3/domain/listAll');
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toMatchObject({
      start: 0,
      includeLabels: 'no',
      apiAccess: 'yes',
    });
    expect(zones).toEqual([
      { id: 'example.com', name: 'example.com' },
      { id: 'example.net', name: 'example.net' },
    ]);
  });

  it('creates a record when no matching name and type exists', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ status: 'SUCCESS', records: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ status: 'SUCCESS', id: '987' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    const result = await dns.upsertRecord('example.com', {
      zone: 'example.com',
      name: 'www.example.com',
      type: 'A',
      value: '1.2.3.4',
      ttl: 600,
    }, {});

    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.porkbun.com/api/json/v3/dns/create/example.com');
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1].body)).toMatchObject({
      name: 'www',
      type: 'A',
      content: '1.2.3.4',
      ttl: 600,
    });
    expect(result).toEqual({
      id: '987',
      zone: 'example.com',
      name: 'www.example.com',
      type: 'A',
      value: '1.2.3.4',
      ttl: 600,
    });
  });

  it('edits an existing matching record during upsert', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          status: 'SUCCESS',
          records: [{ id: '456', name: 'api.example.com', type: 'A', content: '1.2.3.4', ttl: '600' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ status: 'SUCCESS' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    const result = await dns.upsertRecord('example.com', {
      zone: 'example.com',
      name: 'api.example.com',
      type: 'A',
      value: '5.6.7.8',
      ttl: 900,
    }, {});

    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.porkbun.com/api/json/v3/dns/edit/example.com/456');
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1].body)).toMatchObject({
      name: 'api',
      type: 'A',
      content: '5.6.7.8',
      ttl: 900,
    });
    expect(result).toMatchObject({ id: '456', value: '5.6.7.8', ttl: 900 });
  });

  it('diffs A records for round-robin sync without disturbing other records', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          status: 'SUCCESS',
          records: [
            { id: '1', name: 'api.example.com', type: 'A', content: '1.1.1.1', ttl: '300' },
            { id: '2', name: 'api.example.com', type: 'A', content: '1.1.1.1', ttl: '300' },
            { id: '3', name: 'api.example.com', type: 'A', content: '2.2.2.2', ttl: '300' },
            { id: '4', name: 'api.example.com', type: 'TXT', content: 'keep-me', ttl: '300' },
          ],
        }),
      })
      .mockResolvedValue({ ok: true, text: async () => JSON.stringify({ status: 'SUCCESS', id: '5' }) });
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    const synced = await dns.syncRoundRobin({
      zoneId: 'example.com',
      name: 'api.example.com',
      ips: ['1.1.1.1', '3.3.3.3'],
      ttl: 600,
    }, {});

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'https://api.porkbun.com/api/json/v3/dns/retrieve/example.com',
      'https://api.porkbun.com/api/json/v3/dns/edit/example.com/1',
      'https://api.porkbun.com/api/json/v3/dns/delete/example.com/2',
      'https://api.porkbun.com/api/json/v3/dns/delete/example.com/3',
      'https://api.porkbun.com/api/json/v3/dns/create/example.com',
    ]);
    expect(JSON.parse(fetchMock.mock.calls[4]?.[1].body)).toMatchObject({
      name: 'api',
      type: 'A',
      content: '3.3.3.3',
      ttl: 600,
    });
    expect(synced.map((record) => record.value)).toEqual(['1.1.1.1', '3.3.3.3']);
  });

  it('uses custom base URLs without duplicate slashes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ status: 'SUCCESS', records: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx(), {});
    await dns.listRecords('example.com', { baseUrl: 'https://porkbun-proxy.test/api/' });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://porkbun-proxy.test/api/dns/retrieve/example.com');
  });

  it('surfaces Porkbun error codes and messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        status: 'ERROR',
        code: 'INVALID_DOMAIN',
        message: 'Invalid domain.',
      }),
    }));

    await dns.connect(ctx(), {});
    await expect(dns.listRecords('bad-domain', {}))
      .rejects.toThrow('Porkbun INVALID_DOMAIN 200: Invalid domain.');
  });
});
