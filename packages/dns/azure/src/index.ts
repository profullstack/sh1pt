import { defineDns, type DnsRecord } from '@sh1pt/core';

// Azure DNS REST API (2018-05-01). Auth: Azure AD service principal
// (client credentials flow → access token for management.azure.com).
// Endpoints:
//   GET  /subscriptions/:sub/resourceGroups/:rg/providers/Microsoft.Network/dnsZones
//   GET  /subscriptions/:sub/resourceGroups/:rg/providers/Microsoft.Network/dnsZones/:zone/recordSets
//   PUT  /…/dnsZones/:zone/recordSets/:type/:name  — create or update
//   DELETE /…/dnsZones/:zone/recordSets/:type/:name
// Azure DNS ALIAS record: a RecordSet of type A/AAAA with an AliasConfiguration
// pointing to another Azure resource. For generic CNAME-at-apex use, set
// type=CNAME (not available on zone apex); prefer ALIAS for apex pointing.
interface Config {
  subscriptionId?: string;
  resourceGroupName?: string;
  defaultTtl?: number;
}

const MGMT = 'https://management.azure.com';
const API_VERSION = '2018-05-01';
let _secret: (k: string) => string | undefined = () => undefined;

async function getAccessToken(): Promise<string> {
  const tenantId = _secret('AZURE_TENANT_ID');
  const clientId = _secret('AZURE_CLIENT_ID');
  const clientSecret = _secret('AZURE_CLIENT_SECRET');
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET not set');
  }
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      resource: 'https://management.azure.com/',
    }),
  });
  if (!res.ok) throw new Error(`Azure getAccessToken: ${res.status}`);
  const { access_token } = await res.json() as { access_token: string };
  return access_token;
}

function subRg(config: Config): { sub: string; rg: string } {
  const sub = config.subscriptionId ?? _secret('AZURE_SUBSCRIPTION_ID');
  const rg = config.resourceGroupName ?? _secret('AZURE_RESOURCE_GROUP');
  if (!sub || !rg) throw new Error('AZURE_SUBSCRIPTION_ID / AZURE_RESOURCE_GROUP not set');
  return { sub, rg };
}

export default defineDns<Config>({
  id: 'dns-azure',
  label: 'Azure DNS',

  async connect(ctx) {
    _secret = (k) => ctx.secret(k);
    await getAccessToken();
    return { accountId: 'azure' };
  },

  async listZones(config) {
    const token = await getAccessToken();
    const { sub, rg } = subRg(config);
    const res = await fetch(
      `${MGMT}/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Network/dnsZones?api-version=${API_VERSION}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`Azure listZones: ${res.status}`);
    const { value } = await res.json() as { value: { name: string }[] };
    return value.map(z => ({ id: z.name, name: z.name }));
  },

  async listRecords(zoneId, config) {
    const token = await getAccessToken();
    const { sub, rg } = subRg(config);
    const res = await fetch(
      `${MGMT}/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Network/dnsZones/${zoneId}/recordSets?api-version=${API_VERSION}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`Azure listRecords: ${res.status}`);
    const { value } = await res.json() as {
      value: {
        name: string;
        type: string;
        properties: { TTL: number; ARecords?: { ipv4Address: string }[]; CNAMERecord?: { cname: string } };
        etag: string;
      }[];
    };
    const records: DnsRecord[] = [];
    for (const rs of value) {
      const rtype = rs.type.split('/').pop() ?? rs.type;
      const fqdn = rs.name === '@' ? zoneId : `${rs.name}.${zoneId}`;
      if (rtype === 'A' && rs.properties.ARecords) {
        for (const a of rs.properties.ARecords) {
          records.push({ id: rs.etag, zone: zoneId, name: fqdn, type: 'A', value: a.ipv4Address, ttl: rs.properties.TTL });
        }
      } else if (rtype === 'CNAME' && rs.properties.CNAMERecord) {
        records.push({ id: rs.etag, zone: zoneId, name: fqdn, type: 'CNAME', value: rs.properties.CNAMERecord.cname, ttl: rs.properties.TTL });
      }
    }
    return records;
  },

  async upsertRecord(zoneId, record, config) {
    const token = await getAccessToken();
    const { sub, rg } = subRg(config);
    const ttl = record.ttl ?? config.defaultTtl ?? 3600;
    const name = record.name.endsWith(`.${zoneId}`)
      ? record.name.slice(0, -(zoneId.length + 1))
      : record.name === zoneId ? '@' : record.name;
    const body =
      record.type === 'A'
        ? { properties: { TTL: ttl, ARecords: [{ ipv4Address: record.value }] } }
        : { properties: { TTL: ttl, CNAMERecord: { cname: record.value } } };

    const res = await fetch(
      `${MGMT}/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Network/dnsZones/${zoneId}/${record.type}/${name}?api-version=${API_VERSION}`,
      { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
    if (!res.ok) throw new Error(`Azure upsertRecord: ${res.status}`);
    const { etag } = await res.json() as { etag: string };
    return { ...record, id: etag, zone: zoneId };
  },

  async deleteRecord(zoneId, recordId, config) {
    // recordId here is the record name (not Azure etag) — caller should pass the name
    const token = await getAccessToken();
    const { sub, rg } = subRg(config);
    // Azure requires type in the URL; we cannot delete by etag alone.
    // Convention: pass recordId as "<type>/<name>" (e.g. "A/@")
    const [type, name] = recordId.includes('/') ? recordId.split('/') : ['A', recordId];
    const res = await fetch(
      `${MGMT}/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Network/dnsZones/${zoneId}/${type}/${name}?api-version=${API_VERSION}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok && res.status !== 404) throw new Error(`Azure deleteRecord: ${res.status}`);
  },

  async syncRoundRobin({ zoneId, name, ips, ttl }, config) {
    // Azure stores all A records for a name in one RecordSet; sync by PUT with full set.
    const token = await getAccessToken();
    const { sub, rg } = subRg(config);
    const ttlFinal = ttl ?? config.defaultTtl ?? 3600;
    const relName = name.endsWith(`.${zoneId}`) ? name.slice(0, -(zoneId.length + 1)) : '@';
    const body = { properties: { TTL: ttlFinal, ARecords: ips.map(ip => ({ ipv4Address: ip })) } };
    const res = await fetch(
      `${MGMT}/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Network/dnsZones/${zoneId}/A/${relName}?api-version=${API_VERSION}`,
      { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
    if (!res.ok) throw new Error(`Azure syncRoundRobin: ${res.status}`);
    return ips.map((ip, i) => ({
      id: `azure-rr-${i}`,
      zone: zoneId,
      name,
      type: 'A' as const,
      value: ip,
      ttl: ttlFinal,
    })) satisfies DnsRecord[];
  },
});
