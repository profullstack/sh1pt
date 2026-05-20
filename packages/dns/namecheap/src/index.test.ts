import { contractTestDns } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import dns from './index.js';

contractTestDns(dns, {
  sampleConfig: {},
  requiredSecrets: ['NAMECHEAP_API_KEY', 'NAMECHEAP_USERNAME'],
});

describe('dns-namecheap', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires both Namecheap API credentials', async () => {
    await expect(dns.connect(ctx({ NAMECHEAP_USERNAME: 'nc_user' }), {}))
      .rejects.toThrow('NAMECHEAP_API_KEY / NAMECHEAP_USERNAME');
  });

  it('maps getHosts XML into sh1pt DNS records', async () => {
    await dns.connect(ctx(), {});
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(xmlResponse([
      host({ HostId: '1', Name: '@', Type: 'A', Address: '192.0.2.10', TTL: '1800' }),
      host({ HostId: '2', Name: 'www', Type: 'TXT', Address: 'hello &amp; welcome', TTL: '' }),
      host({ HostId: '3', Name: 'api.v1', Type: 'MX', Address: 'mail.example.com', TTL: '7200', MXPref: '10' }),
    ]));

    const records = await dns.listRecords('example.com', {
      baseUrl: 'https://api.example.test/xml.response',
      defaultTtl: 600,
    });

    expect(records).toEqual([
      {
        id: '1',
        zone: 'example.com',
        name: 'example.com',
        type: 'A',
        value: '192.0.2.10',
        ttl: 1800,
        mxPref: undefined,
      },
      {
        id: '2',
        zone: 'example.com',
        name: 'www.example.com',
        type: 'TXT',
        value: 'hello & welcome',
        ttl: 600,
        mxPref: undefined,
      },
      {
        id: '3',
        zone: 'example.com',
        name: 'api.v1.example.com',
        type: 'MX',
        value: 'mail.example.com',
        ttl: 7200,
        mxPref: '10',
      },
    ]);

    const params = queryParams(fetchMock, 0);
    expect(params).toMatchObject({
      Command: 'namecheap.domains.dns.getHosts',
      SLD: 'example',
      TLD: 'com',
      ApiUser: 'nc_user',
      UserName: 'nc_user',
      ClientIp: '127.0.0.1',
    });
  });

  it('creates a record via full-zone setHosts while preserving existing records', async () => {
    await dns.connect(ctx(), {});
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(xmlResponse([
        host({ HostId: '1', Name: '@', Type: 'A', Address: '192.0.2.10', TTL: '1800' }),
        host({ HostId: '2', Name: 'www', Type: 'TXT', Address: 'keep-me', TTL: '900' }),
      ]))
      .mockResolvedValueOnce(xmlResponse([]));

    const record = await dns.upsertRecord('example.com', {
      zone: 'example.com',
      name: 'api',
      type: 'A',
      value: '203.0.113.8',
      ttl: 120,
    }, { baseUrl: 'https://api.example.test/xml.response' });

    expect(record).toMatchObject({
      id: 'api.example.com',
      zone: 'example.com',
      name: 'api.example.com',
      type: 'A',
      value: '203.0.113.8',
      ttl: 120,
    });

    const params = queryParams(fetchMock, 1);
    expect(params).toMatchObject({
      Command: 'namecheap.domains.dns.setHosts',
      SLD: 'example',
      TLD: 'com',
      HostName1: '@',
      RecordType1: 'A',
      Address1: '192.0.2.10',
      TTL1: '1800',
      HostName2: 'www',
      RecordType2: 'TXT',
      Address2: 'keep-me',
      TTL2: '900',
      HostName3: 'api',
      RecordType3: 'A',
      Address3: '203.0.113.8',
      TTL3: '120',
    });
    expect(params.HostName4).toBeUndefined();
  });

  it('updates an existing record in the full-zone payload', async () => {
    await dns.connect(ctx(), {});
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(xmlResponse([
        host({ HostId: '10', Name: 'api', Type: 'A', Address: '192.0.2.10', TTL: '1800' }),
      ]))
      .mockResolvedValueOnce(xmlResponse([]));

    const record = await dns.upsertRecord('example.com', {
      zone: 'example.com',
      name: 'api.example.com',
      type: 'A',
      value: '203.0.113.9',
      ttl: undefined as unknown as number,
    }, { defaultTtl: 450 });

    expect(record).toMatchObject({
      id: '10',
      name: 'api.example.com',
      value: '203.0.113.9',
      ttl: 450,
    });

    const params = queryParams(fetchMock, 1);
    expect(params).toMatchObject({
      HostName1: 'api',
      RecordType1: 'A',
      Address1: '203.0.113.9',
      TTL1: '450',
    });
    expect(params.HostName2).toBeUndefined();
  });

  it('deletes by record id or normalized record name while preserving other records', async () => {
    await dns.connect(ctx(), {});
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(xmlResponse([
        host({ HostId: '1', Name: '@', Type: 'A', Address: '192.0.2.10', TTL: '1800' }),
        host({ HostId: '2', Name: 'api', Type: 'A', Address: '192.0.2.11', TTL: '1800' }),
        host({ HostId: '3', Name: 'www', Type: 'A', Address: '192.0.2.12', TTL: '1800' }),
      ]))
      .mockResolvedValueOnce(xmlResponse([]));

    await dns.deleteRecord('example.com', 'api.example.com', {});

    const params = queryParams(fetchMock, 1);
    expect(params).toMatchObject({
      HostName1: '@',
      Address1: '192.0.2.10',
      HostName2: 'www',
      Address2: '192.0.2.12',
    });
    expect(params.HostName3).toBeUndefined();
  });

  it('syncs round-robin A records while preserving unrelated full-zone records', async () => {
    await dns.connect(ctx(), {});
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(xmlResponse([
        host({ HostId: '1', Name: 'api', Type: 'A', Address: '198.51.100.1', TTL: '600' }),
        host({ HostId: '2', Name: 'api', Type: 'A', Address: '198.51.100.1', TTL: '600' }),
        host({ HostId: '3', Name: 'api', Type: 'A', Address: '198.51.100.9', TTL: '600' }),
        host({ HostId: '4', Name: 'api', Type: 'AAAA', Address: '2001:db8::1', TTL: '600' }),
        host({ HostId: '5', Name: '@', Type: 'TXT', Address: 'zone-note', TTL: '1800' }),
        host({ HostId: '6', Name: 'mail', Type: 'MX', Address: 'mail.example.com', TTL: '1800', MXPref: '10' }),
      ]))
      .mockResolvedValueOnce(xmlResponse([]));

    const records = await dns.syncRoundRobin({
      zoneId: 'example.com',
      name: 'api',
      ips: ['198.51.100.1', '198.51.100.2', '198.51.100.2'],
      ttl: 300,
    }, {});

    expect(records).toEqual([
      {
        id: '1',
        zone: 'example.com',
        name: 'api.example.com',
        type: 'A',
        value: '198.51.100.1',
        ttl: 300,
        mxPref: undefined,
      },
      {
        id: 'api.example.com:198.51.100.2',
        zone: 'example.com',
        name: 'api.example.com',
        type: 'A',
        value: '198.51.100.2',
        ttl: 300,
      },
    ]);

    const params = queryParams(fetchMock, 1);
    expect(params).toMatchObject({
      HostName1: 'api',
      RecordType1: 'AAAA',
      Address1: '2001:db8::1',
      TTL1: '600',
      HostName2: '@',
      RecordType2: 'TXT',
      Address2: 'zone-note',
      TTL2: '1800',
      HostName3: 'mail',
      RecordType3: 'MX',
      Address3: 'mail.example.com',
      MXPref3: '10',
      HostName4: 'api',
      RecordType4: 'A',
      Address4: '198.51.100.1',
      TTL4: '300',
      HostName5: 'api',
      RecordType5: 'A',
      Address5: '198.51.100.2',
      TTL5: '300',
    });
    expect(params.HostName6).toBeUndefined();
  });

  it('uses custom API URL, client IP, and multi-part TLD domains', async () => {
    await dns.connect(ctx({
      NAMECHEAP_USERNAME: 'nc_user',
      NAMECHEAP_API_KEY: 'nc_test',
      NAMECHEAP_CLIENT_IP: '192.0.2.20',
    }), {});
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(xmlResponse([]));

    await dns.listRecords('example.co.uk', {
      baseUrl: 'https://custom.example.test/xml.response',
      clientIp: '198.51.100.23',
    });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    const params = Object.fromEntries(url.searchParams.entries());
    expect(`${url.origin}${url.pathname}`).toBe('https://custom.example.test/xml.response');
    expect(params).toMatchObject({
      SLD: 'example',
      TLD: 'co.uk',
      ClientIp: '198.51.100.23',
    });
  });

  it('surfaces Namecheap API error details', async () => {
    await dns.connect(ctx(), {});
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(rawXmlResponse(`
      <ApiResponse Status="ERROR">
        <Errors><Error Number="2019166">IP address invalid &amp; blocked</Error></Errors>
      </ApiResponse>
    `));

    await expect(dns.listRecords('example.com', {}))
      .rejects.toThrow('IP address invalid & blocked');
  });
});

function ctx(secrets: Record<string, string> = {
  NAMECHEAP_USERNAME: 'nc_user',
  NAMECHEAP_API_KEY: 'nc_test',
}) {
  return {
    secret(key: string) {
      return secrets[key];
    },
    log: vi.fn(),
  };
}

function host(attrs: Record<string, string>): string {
  const serialized = Object.entries(attrs)
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ');
  return `<Host ${serialized}/>`;
}

function xmlResponse(hosts: string[]): Response {
  return rawXmlResponse(`
    <ApiResponse Status="OK">
      <CommandResponse>
        <DomainDNSGetHostsResult>${hosts.join('')}</DomainDNSGetHostsResult>
      </CommandResponse>
    </ApiResponse>
  `);
}

function rawXmlResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as Response;
}

function queryParams(
  fetchMock: { mock: { calls: readonly (readonly unknown[])[] } },
  callIndex: number,
): Record<string, string> {
  const call = fetchMock.mock.calls[callIndex];
  if (!call) throw new Error(`Missing fetch call ${callIndex}`);
  const url = new URL(String(call[0]));
  return Object.fromEntries(url.searchParams.entries());
}
