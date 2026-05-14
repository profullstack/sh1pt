import { defineDns, tokenSetup, type DnsRecord } from '@profullstack/sh1pt-core';

// Cloudflare DNS API v4. Auth: Bearer token scoped to Zone.DNS:Edit.
// Endpoints: /client/v4/zones, /client/v4/zones/:id/dns_records
// Cloudflare's 'orange cloud' (proxied=true) routes traffic through the
// CF edge — great default for waitlist pages, but disable it for
// round-robin to VPS backends that can't terminate TLS themselves.
interface Config {
  accountId?: string;
  defaultTtl?: number;           // 1 = auto; otherwise >= 60
  defaultProxied?: boolean;
}

const API = 'https://api.cloudflare.com/client/v4';
let _secret: (k: string) => string | undefined = () => undefined;

interface CloudflareZone {
  id: string;
  name: string;
}

interface CloudflareRecord {
  id: string;
  name: string;
  type: string;
  content: string;
  ttl: number;
  proxied?: boolean;
}

interface CloudflareEnvelope<T> {
  result: T;
  errors?: Array<{ code?: number; message?: string }>;
  result_info?: { page?: number; total_pages?: number };
}

function authHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${_secret('CLOUDFLARE_API_TOKEN')}`,
    'content-type': 'application/json',
  };
}

function proxiable(type: DnsRecord['type']): boolean {
  return type === 'A' || type === 'AAAA' || type === 'CNAME';
}

function recordNameMatches(actual: string, requested: string): boolean {
  if (actual === requested) return true;
  if (requested === '@') return false;
  return !requested.includes('.') && actual.startsWith(`${requested}.`);
}

function toDnsRecord(zoneId: string, record: CloudflareRecord): DnsRecord {
  return {
    id: record.id,
    zone: zoneId,
    name: record.name,
    type: record.type as DnsRecord['type'],
    value: record.content,
    ttl: record.ttl,
    proxied: record.proxied,
  };
}

function recordPayload(record: Omit<DnsRecord, 'id'>, config: Config): Record<string, unknown> {
  const body: Record<string, unknown> = {
    type: record.type,
    name: record.name,
    content: record.value,
    ttl: record.ttl ?? config.defaultTtl ?? 60,
  };
  if (proxiable(record.type)) {
    body.proxied = record.proxied ?? config.defaultProxied ?? false;
  }
  return body;
}

async function readError(operation: string, res: Response): Promise<Error> {
  const body = (await res.text()).slice(0, 200);
  return new Error(`Cloudflare ${operation}: ${res.status}${body ? ` ${body}` : ''}`);
}

async function requestJson<T>(operation: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) throw await readError(operation, res);
  const data = await res.json() as CloudflareEnvelope<T>;
  return data.result;
}

async function requestAll<T>(operation: string, path: string, params = new URLSearchParams()): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    params.set('page', String(page));
    const res = await fetch(`${API}${path}?${params.toString()}`, { headers: authHeaders() });
    if (!res.ok) throw await readError(operation, res);
    const data = await res.json() as CloudflareEnvelope<T[]>;
    items.push(...data.result);
    totalPages = data.result_info?.total_pages ?? 1;
    page += 1;
  } while (page <= totalPages);

  return items;
}

async function createRecord(zoneId: string, record: Omit<DnsRecord, 'id'>, config: Config): Promise<DnsRecord> {
  const created = await requestJson<CloudflareRecord>(
    'createRecord',
    `/zones/${zoneId}/dns_records`,
    {
      method: 'POST',
      body: JSON.stringify(recordPayload(record, config)),
    },
  );
  return toDnsRecord(zoneId, created);
}

async function updateRecord(zoneId: string, recordId: string, record: Omit<DnsRecord, 'id'>, config: Config): Promise<DnsRecord> {
  const updated = await requestJson<CloudflareRecord>(
    'updateRecord',
    `/zones/${zoneId}/dns_records/${recordId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(recordPayload(record, config)),
    },
  );
  return toDnsRecord(zoneId, updated);
}

export default defineDns<Config>({
  id: 'dns-cloudflare',
  label: 'Cloudflare DNS',

  async connect(ctx) {
    _secret = (k) => ctx.secret(k);
    if (!ctx.secret('CLOUDFLARE_API_TOKEN')) throw new Error('CLOUDFLARE_API_TOKEN not set');
    return { accountId: 'cloudflare' };
  },

  async listZones(config) {
    const params = new URLSearchParams({ per_page: '100' });
    if (config.accountId) params.set('account.id', config.accountId);
    const zones = await requestAll<CloudflareZone>('listZones', '/zones', params);
    return zones.map(zone => ({ id: zone.id, name: zone.name }));
  },

  async listRecords(zoneId) {
    const records = await requestAll<CloudflareRecord>(
      'listRecords',
      `/zones/${zoneId}/dns_records`,
      new URLSearchParams({ per_page: '100' }),
    );
    return records.map(record => toDnsRecord(zoneId, record));
  },

  async upsertRecord(zoneId, record, config) {
    const existing = (await this.listRecords(zoneId, config)).find(
      r => r.type === record.type && recordNameMatches(r.name, record.name),
    );
    if (existing) return updateRecord(zoneId, existing.id, record, config);
    return createRecord(zoneId, record, config);
  },

  async deleteRecord(zoneId, recordId) {
    const res = await fetch(`${API}/zones/${zoneId}/dns_records/${recordId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok && res.status !== 404) throw await readError('deleteRecord', res);
  },

  async syncRoundRobin({ zoneId, name, ips, ttl, proxied }, config) {
    const ttlFinal = ttl ?? config.defaultTtl ?? 60;
    const proxiedFinal = proxied ?? config.defaultProxied ?? false;
    const targetIps = new Set(ips);
    const existing = (await this.listRecords(zoneId, config)).filter(
      r => r.type === 'A' && recordNameMatches(r.name, name),
    );

    const records: DnsRecord[] = [];
    for (const record of existing) {
      if (!targetIps.has(record.value)) {
        await this.deleteRecord(zoneId, record.id, config);
        continue;
      }

      targetIps.delete(record.value);
      if (record.ttl !== ttlFinal || record.proxied !== proxiedFinal || record.name !== name) {
        records.push(await updateRecord(zoneId, record.id, {
          zone: zoneId,
          name,
          type: 'A',
          value: record.value,
          ttl: ttlFinal,
          proxied: proxiedFinal,
        }, config));
      } else {
        records.push(record);
      }
    }

    for (const ip of targetIps) {
      records.push(await createRecord(zoneId, {
        zone: zoneId,
        name,
        type: 'A',
        value: ip,
        ttl: ttlFinal,
        proxied: proxiedFinal,
      }, config));
    }

    return records;
  },

  setup: tokenSetup<Config>({
    secretKey: 'CLOUDFLARE_API_TOKEN',
    label: 'Cloudflare DNS',
    vendorDocUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    steps: [
      'Open dash.cloudflare.com → My Profile → API Tokens → Create Token',
      'Use the "Edit zone DNS" template (or custom with Zone.DNS:Edit)',
      'Scope to the zones sh1pt should manage → Continue → Create → copy the token',
    ],
  }),
});
