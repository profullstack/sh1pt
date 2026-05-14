import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import dns from './index.js';

smokeTest(dns, { idPrefix: 'dns' });

const ctx = (secrets: Record<string, string> = {
  AWS_ACCESS_KEY_ID: 'AKIDEXAMPLE',
  AWS_SECRET_ACCESS_KEY: 'secret',
}) => ({
  secret: (key: string) => secrets[key],
  log: () => {},
});

const route53Response = (xml: string, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => xml,
});

const zonePage = (zones: Array<{ id: string; name: string }>, nextMarker?: string) => `
<ListHostedZonesResponse>
  <HostedZones>
    ${zones.map(zone => `<HostedZone><Id>/hostedzone/${zone.id}</Id><Name>${zone.name}.</Name></HostedZone>`).join('')}
  </HostedZones>
  <IsTruncated>${nextMarker ? 'true' : 'false'}</IsTruncated>
  ${nextMarker ? `<NextMarker>${nextMarker}</NextMarker>` : ''}
</ListHostedZonesResponse>`;

const recordPage = (sets: string[], next?: { name: string; type: string }) => `
<ListResourceRecordSetsResponse>
  <ResourceRecordSets>${sets.join('')}</ResourceRecordSets>
  <IsTruncated>${next ? 'true' : 'false'}</IsTruncated>
  ${next ? `<NextRecordName>${next.name}</NextRecordName><NextRecordType>${next.type}</NextRecordType>` : ''}
</ListResourceRecordSetsResponse>`;

const rrset = (name: string, type: string, ttl: number, values: string[]) => `
<ResourceRecordSet>
  <Name>${name}</Name>
  <Type>${type}</Type>
  <TTL>${ttl}</TTL>
  <ResourceRecords>
    ${values.map(value => `<ResourceRecord><Value>${value}</Value></ResourceRecord>`).join('')}
  </ResourceRecords>
</ResourceRecordSet>`;

const aliasSet = (name: string, dnsName: string) => `
<ResourceRecordSet>
  <Name>${name}</Name>
  <Type>A</Type>
  <AliasTarget><DNSName>${dnsName}</DNSName></AliasTarget>
</ResourceRecordSet>`;

function request(index: number, fetchMock: ReturnType<typeof vi.fn>): { url: string; init: RequestInit; body: string } {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return { url, init, body: String(init.body ?? '') };
}

describe('AWS Route 53 DNS API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires AWS credentials on connect', async () => {
    await expect(dns.connect(ctx({}) as any, {})).rejects.toThrow(/AWS_ACCESS_KEY_ID/);
  });

  it('lists hosted zones with SigV4 auth and pagination', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(route53Response(zonePage([{ id: 'Z1', name: 'example.com' }], 'next-page')))
      .mockResolvedValueOnce(route53Response(zonePage([{ id: 'Z2', name: 'example.dev' }])));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx() as any, {});
    const zones = await dns.listZones({});

    expect(zones).toEqual([
      { id: 'Z1', name: 'example.com' },
      { id: 'Z2', name: 'example.dev' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(request(0, fetchMock).url).toBe('https://route53.amazonaws.com/2013-04-01/hostedzone?maxitems=100');
    expect(request(1, fetchMock).url).toContain('marker=next-page');
    const headers = request(0, fetchMock).init.headers as Record<string, string>;
    expect(headers.authorization).toContain('Credential=AKIDEXAMPLE/');
    expect(headers.authorization).toContain('SignedHeaders=host;x-amz-content-sha256;x-amz-date');
    expect(headers['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/);
  });

  it('lists supported DNS records and maps aliases to CNAME-like entries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(route53Response(recordPage([
      rrset('api.example.com.', 'A', 60, ['1.1.1.1', '2.2.2.2']),
      rrset('example.com.', 'NS', 172800, ['ns-1.awsdns.com.']),
      aliasSet('cdn.example.com.', 'target.cloudfront.net.'),
    ]))));

    await dns.connect(ctx() as any, {});
    const records = await dns.listRecords('Z1', {});

    expect(records).toEqual([
      expect.objectContaining({ zone: 'Z1', name: 'api.example.com', type: 'A', value: '1.1.1.1', ttl: 60 }),
      expect.objectContaining({ zone: 'Z1', name: 'api.example.com', type: 'A', value: '2.2.2.2', ttl: 60 }),
      expect.objectContaining({ zone: 'Z1', name: 'cdn.example.com', type: 'CNAME', value: 'target.cloudfront.net', ttl: 0 }),
    ]);
    expect(records).toHaveLength(3);
  });

  it('upserts records by preserving existing same-name values', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(route53Response(recordPage([
        rrset('api.example.com.', 'A', 60, ['1.1.1.1']),
      ])))
      .mockResolvedValueOnce(route53Response('<ChangeResourceRecordSetsResponse />'));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx() as any, {});
    const result = await dns.upsertRecord('Z1', {
      zone: 'Z1',
      name: 'api.example.com',
      type: 'A',
      value: '2.2.2.2',
      ttl: 120,
    }, {});

    const change = request(1, fetchMock);
    expect(change.url).toBe('https://route53.amazonaws.com/2013-04-01/hostedzone/Z1/rrset');
    expect(change.init.method).toBe('POST');
    expect(change.body).toContain('<Action>UPSERT</Action>');
    expect(change.body).toContain('<TTL>120</TTL>');
    expect(change.body).toContain('<Value>1.1.1.1</Value>');
    expect(change.body).toContain('<Value>2.2.2.2</Value>');
    expect(result).toMatchObject({ name: 'api.example.com', type: 'A', value: '2.2.2.2', ttl: 120 });
  });

  it('deletes a single value from a multi-value RRSet via UPSERT', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(route53Response(recordPage([
        rrset('api.example.com.', 'A', 60, ['1.1.1.1', '2.2.2.2']),
      ])))
      .mockResolvedValueOnce(route53Response(recordPage([
        rrset('api.example.com.', 'A', 60, ['1.1.1.1', '2.2.2.2']),
      ])))
      .mockResolvedValueOnce(route53Response('<ChangeResourceRecordSetsResponse />'));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx() as any, {});
    const record = (await dns.listRecords('Z1', {}))[0]!;
    await dns.deleteRecord('Z1', record.id, {});

    const change = request(2, fetchMock);
    expect(change.body).toContain('<Action>UPSERT</Action>');
    expect(change.body).not.toContain('<Value>1.1.1.1</Value>');
    expect(change.body).toContain('<Value>2.2.2.2</Value>');
  });

  it('deletes the whole RRSet when the last value is removed', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(route53Response(recordPage([
        rrset('api.example.com.', 'A', 60, ['1.1.1.1']),
      ])))
      .mockResolvedValueOnce(route53Response(recordPage([
        rrset('api.example.com.', 'A', 60, ['1.1.1.1']),
      ])))
      .mockResolvedValueOnce(route53Response('<ChangeResourceRecordSetsResponse />'));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx() as any, {});
    const record = (await dns.listRecords('Z1', {}))[0]!;
    await dns.deleteRecord('Z1', record.id, {});

    const change = request(2, fetchMock);
    expect(change.body).toContain('<Action>DELETE</Action>');
    expect(change.body).toContain('<Value>1.1.1.1</Value>');
  });

  it('syncs round-robin A records with one Route 53 UPSERT', async () => {
    const fetchMock = vi.fn().mockResolvedValue(route53Response('<ChangeResourceRecordSetsResponse />'));
    vi.stubGlobal('fetch', fetchMock);

    await dns.connect(ctx() as any, {});
    const records = await dns.syncRoundRobin({
      zoneId: 'Z1',
      name: 'api.example.com',
      ips: ['1.1.1.1', '1.1.1.1', '2.2.2.2'],
      ttl: 30,
    }, {});

    expect(records.map(record => record.value)).toEqual(['1.1.1.1', '2.2.2.2']);
    const change = request(0, fetchMock);
    expect(change.body).toContain('<Action>UPSERT</Action>');
    expect(change.body).toContain('<TTL>30</TTL>');
    expect(change.body).toContain('<Name>api.example.com.</Name>');
    expect(change.body).toContain('<Value>1.1.1.1</Value>');
    expect(change.body).toContain('<Value>2.2.2.2</Value>');
  });

  it('surfaces Route 53 API failures with status and response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(route53Response('<Error><Message>denied</Message></Error>', 403)));

    await dns.connect(ctx() as any, {});
    await expect(dns.listZones({})).rejects.toThrow(/Route53 listZones: 403/);
    await expect(dns.listZones({})).rejects.toThrow(/denied/);
  });
});
