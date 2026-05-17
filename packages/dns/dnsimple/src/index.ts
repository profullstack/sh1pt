import { defineDns, type DnsRecord } from '@profullstack/sh1pt-core';

// DNSimple DNS API v2. Auth: Bearer OAuth token or personal access token.
// Endpoints (all under https://api.dnsimple.com/v2/:account_id):
//   GET  /domains                              — list domains (zones)
//   GET  /zones/:zone/records                  — list records
//   POST /zones/:zone/records                  — create a record
//   PATCH /zones/:zone/records/:id             — update a record
//   DELETE /zones/:zone/records/:id            — delete a record
// DNSimple ALIAS record: type=ALIAS, content=target hostname (FQDN).
// ALIAS is the recommended way to point a bare domain to another hostname.
interface Config {
  accountId?: string;  // if empty, fetched from /whoami
  defaultTtl?: number;
}

const API = 'https://api.dnsimple.com/v2';
let _secret: (k: string) => string | undefined = () => undefined;

function authHeader() {
  return {
    Authorization: `Bearer ${_secret('DNSIMPLE_API_TOKEN')}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function resolveAccountId(config: Config): Promise<string> {
  if (config.accountId) return config.accountId;
  const res = await fetch(`${API}/whoami`, { headers: authHeader() });
  if (!res.ok) throw new Error(`DNSimple whoami: ${res.status}`);
  const { data } = await res.json() as { data: { account?: { id: number } } };
  if (!data.account) throw new Error('DNSimple: not authenticated as an account (user token?)');
  return String(data.account.id);
}

export default defineDns<Config>({
  id: 'dns-dnsimple',
  label: 'DNSimple',

  async connect(ctx) {
    _secret = (k) => ctx.secret(k);
    if (!ctx.secret('DNSIMPLE_API_TOKEN')) {
      throw new Error('DNSIMPLE_API_TOKEN not set — run `sh1pt secret set DNSIMPLE_API_TOKEN ...` (required)');
    }
    return { accountId: 'dnsimple' };
  },

  async listZones(config) {
    const accountId = await resolveAccountId(config);
    const res = await fetch(`${API}/${accountId}/domains?per_page=100`, { headers: authHeader() });
    if (!res.ok) throw new Error(`DNSimple listZones: ${res.status}`);
    const { data } = await res.json() as { data: { id: number; name: string }[] };
    return data.map(d => ({ id: d.name, name: d.name }));
  },

  async listRecords(zoneId, config) {
    const accountId = await resolveAccountId(config);
    const res = await fetch(`${API}/${accountId}/zones/${zoneId}/records?per_page=100`, {
      headers: authHeader(),
    });
    if (!res.ok) throw new Error(`DNSimple listRecords: ${res.status}`);
    const { data } = await res.json() as {
      data: { id: number; name: string; type: string; content: string; ttl: number }[];
    };
    return data.map(r => ({
      id: String(r.id),
      zone: zoneId,
      name: r.name ? `${r.name}.${zoneId}` : zoneId,
      type: r.type as DnsRecord['type'],
      value: r.content,
      ttl: r.ttl,
    }));
  },

  async upsertRecord(zoneId, record, config) {
    const accountId = await resolveAccountId(config);
    const ttl = record.ttl ?? config.defaultTtl ?? 3600;
    const name = record.name.endsWith(`.${zoneId}`)
      ? record.name.slice(0, -(zoneId.length + 1))
      : record.name === zoneId ? '' : record.name;

    const existing = (await this.listRecords(zoneId, config)).find(
      r => r.name === record.name && r.type === record.type,
    );

    if (existing) {
      const res = await fetch(`${API}/${accountId}/zones/${zoneId}/records/${existing.id}`, {
        method: 'PATCH',
        headers: authHeader(),
        body: JSON.stringify({ content: record.value, ttl }),
      });
      if (!res.ok) throw new Error(`DNSimple upsertRecord (update): ${res.status}`);
      return { ...record, id: existing.id, zone: zoneId };
    }

    const res = await fetch(`${API}/${accountId}/zones/${zoneId}/records`, {
      method: 'POST',
      headers: authHeader(),
      body: JSON.stringify({ name, type: record.type, content: record.value, ttl }),
    });
    if (!res.ok) throw new Error(`DNSimple upsertRecord (create): ${res.status}`);
    const { data } = await res.json() as { data: { id: number } };
    return { ...record, id: String(data.id), zone: zoneId };
  },

  async deleteRecord(zoneId, recordId, config) {
    const accountId = await resolveAccountId(config);
    const res = await fetch(`${API}/${accountId}/zones/${zoneId}/records/${recordId}`, {
      method: 'DELETE',
      headers: authHeader(),
    });
    if (!res.ok && res.status !== 404) throw new Error(`DNSimple deleteRecord: ${res.status}`);
  },

  async syncRoundRobin({ zoneId, name, ips, ttl }, config) {
    // Stubbed: shape-only return. Real impl diffs existing A records at
    // `name` against `ips` via listRecords/upsertRecord/deleteRecord.
    const ttlFinal = ttl ?? config.defaultTtl ?? 3600;
    return ips.map((ip, i) => ({
      id: `dnsimple-rr-${i}`,
      zone: zoneId,
      name,
      type: 'A' as const,
      value: ip,
      ttl: ttlFinal,
    })) satisfies DnsRecord[];
  },
});
