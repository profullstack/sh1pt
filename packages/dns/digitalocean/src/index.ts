import { defineDns, type DnsRecord } from '@sh1pt/core';

// DigitalOcean DNS API v2. Auth: Bearer personal access token.
// Endpoints:
//   GET  /v2/domains                         — list all domains
//   GET  /v2/domains/:domain/records          — list DNS records
//   POST /v2/domains/:domain/records          — create a record
//   PUT  /v2/domains/:domain/records/:id      — update a record
//   DELETE /v2/domains/:domain/records/:id    — delete a record
// DigitalOcean uses A records (not ALIAS) for domain apex pointing.
interface Config {
  defaultTtl?: number;
}

const API = 'https://api.digitalocean.com/v2';
let _secret: (k: string) => string | undefined = () => undefined;

function authHeader() {
  return { Authorization: `Bearer ${_secret('DO_API_TOKEN')}` };
}

export default defineDns<Config>({
  id: 'dns-digitalocean',
  label: 'DigitalOcean DNS',

  async connect(ctx) {
    _secret = (k) => ctx.secret(k);
    if (!ctx.secret('DO_API_TOKEN')) throw new Error('DO_API_TOKEN not set');
    return { accountId: 'digitalocean' };
  },

  async listZones() {
    const res = await fetch(`${API}/domains`, { headers: authHeader() });
    if (!res.ok) throw new Error(`DigitalOcean listZones: ${res.status}`);
    const { domains } = await res.json() as { domains: { name: string }[] };
    return domains.map(d => ({ id: d.name, name: d.name }));
  },

  async listRecords(zoneId) {
    const res = await fetch(`${API}/domains/${zoneId}/records?per_page=200`, {
      headers: authHeader(),
    });
    if (!res.ok) throw new Error(`DigitalOcean listRecords: ${res.status}`);
    const { domain_records } = await res.json() as {
      domain_records: { id: number; name: string; type: string; data: string; ttl: number }[];
    };
    return domain_records.map(r => ({
      id: String(r.id),
      zone: zoneId,
      name: r.name === '@' ? zoneId : `${r.name}.${zoneId}`,
      type: r.type as DnsRecord['type'],
      value: r.data,
      ttl: r.ttl,
    }));
  },

  async upsertRecord(zoneId, record, config) {
    const ttl = record.ttl ?? config.defaultTtl ?? 1800;
    const subdomain = record.name.endsWith(`.${zoneId}`)
      ? record.name.slice(0, -(zoneId.length + 1))
      : record.name === zoneId ? '@' : record.name;

    const existing = await this.listRecords(zoneId, config);
    const match = existing.find(r => r.name === record.name && r.type === record.type);

    if (match) {
      const res = await fetch(`${API}/domains/${zoneId}/records/${match.id}`, {
        method: 'PUT',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: record.value, ttl }),
      });
      if (!res.ok) throw new Error(`DigitalOcean upsertRecord (update): ${res.status}`);
      return { ...record, id: match.id, zone: zoneId };
    }

    const res = await fetch(`${API}/domains/${zoneId}/records`, {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: record.type, name: subdomain, data: record.value, ttl }),
    });
    if (!res.ok) throw new Error(`DigitalOcean upsertRecord (create): ${res.status}`);
    const { domain_record } = await res.json() as { domain_record: { id: number } };
    return { ...record, id: String(domain_record.id), zone: zoneId };
  },

  async deleteRecord(zoneId, recordId) {
    const res = await fetch(`${API}/domains/${zoneId}/records/${recordId}`, {
      method: 'DELETE',
      headers: authHeader(),
    });
    if (!res.ok && res.status !== 404) throw new Error(`DigitalOcean deleteRecord: ${res.status}`);
  },

  async syncRoundRobin({ zoneId, name, ips, ttl }, config) {
    const ttlFinal = ttl ?? config.defaultTtl ?? 1800;
    const existing = (await this.listRecords(zoneId, config)).filter(
      r => r.name === name && r.type === 'A',
    );

    const toDelete = existing.filter(r => !ips.includes(r.value));
    const toCreate = ips.filter(ip => !existing.some(r => r.value === ip));

    await Promise.all(toDelete.map(r => this.deleteRecord(zoneId, r.id, config)));
    const created = await Promise.all(
      toCreate.map(ip =>
        this.upsertRecord(zoneId, { zone: zoneId, name, type: 'A', value: ip, ttl: ttlFinal }, config),
      ),
    );

    return [...existing.filter(r => ips.includes(r.value)), ...created] as DnsRecord[];
  },
});
