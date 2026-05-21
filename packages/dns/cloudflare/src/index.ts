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

interface CloudflareEnvelope<T> {
  success: boolean;
  errors?: { message?: string; code?: number }[];
  result: T;
  result_info?: {
    page: number;
    per_page: number;
    total_pages: number;
    total_count: number;
  };
}

interface CloudflareZone {
  id: string;
  name: string;
}

interface CloudflareDnsRecord {
  id: string;
  zone_id?: string;
  zone_name?: string;
  name: string;
  type: string;
  content: string;
  ttl: number;
  proxied?: boolean;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${_secret('CLOUDFLARE_API_TOKEN')}`,
    'Content-Type': 'application/json',
  };
}

function errorMessage(prefix: string, status: number, body: string) {
  try {
    const parsed = JSON.parse(body) as { errors?: { message?: string; code?: number }[] };
    const details = parsed.errors?.map((e) => e.message ?? e.code).filter(Boolean).join('; ');
    return details ? `${prefix}: ${status} ${details}` : `${prefix}: ${status}`;
  } catch {
    return `${prefix}: ${status}${body ? ` ${body.slice(0, 160)}` : ''}`;
  }
}

async function cfRequest<T>(path: string, init: RequestInit = {}, prefix = 'Cloudflare DNS') {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(errorMessage(prefix, res.status, text));
  const json = JSON.parse(text) as CloudflareEnvelope<T>;
  if (!json.success) {
    const details = json.errors?.map((e) => e.message ?? e.code).filter(Boolean).join('; ');
    throw new Error(details ? `${prefix}: ${details}` : `${prefix}: request failed`);
  }
  return json;
}

async function cfListAll<T>(path: string, prefix: string) {
  const items: T[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const separator = path.includes('?') ? '&' : '?';
    const json = await cfRequest<T[]>(`${path}${separator}page=${page}&per_page=100`, {}, prefix);
    items.push(...json.result);
    totalPages = json.result_info?.total_pages ?? 1;
    page += 1;
  } while (page <= totalPages);

  return items;
}

function supportsProxied(type: string) {
  return type === 'A' || type === 'AAAA' || type === 'CNAME';
}

function toDnsRecord(zoneId: string, record: CloudflareDnsRecord): DnsRecord {
  return {
    id: record.id,
    zone: record.zone_id ?? zoneId,
    name: record.name,
    type: record.type as DnsRecord['type'],
    value: record.content,
    ttl: record.ttl,
    ...(record.proxied === undefined ? {} : { proxied: record.proxied }),
  };
}

function recordPayload(record: Omit<DnsRecord, 'id'>, config: Config) {
  const ttl = record.ttl ?? config.defaultTtl ?? 1;
  const proxied = record.proxied ?? config.defaultProxied;
  return {
    type: record.type,
    name: record.name,
    content: record.value,
    ttl,
    ...(proxied === undefined || !supportsProxied(record.type) ? {} : { proxied }),
  };
}

export default defineDns<Config>({
  id: 'dns-cloudflare',
  label: 'Cloudflare DNS',

  async connect(ctx) {
    _secret = (k) => ctx.secret(k);
    if (!ctx.secret('CLOUDFLARE_API_TOKEN')) throw new Error('CLOUDFLARE_API_TOKEN not set');
    return { accountId: 'cloudflare' };
  },

  async listZones() {
    const zones = await cfListAll<CloudflareZone>('/zones', 'Cloudflare listZones');
    return zones.map((zone) => ({ id: zone.id, name: zone.name }));
  },

  async listRecords(zoneId) {
    const records = await cfListAll<CloudflareDnsRecord>(
      `/zones/${zoneId}/dns_records`,
      'Cloudflare listRecords',
    );
    return records.map((record) => toDnsRecord(zoneId, record));
  },

  async upsertRecord(zoneId, record, config) {
    const existing = (await this.listRecords(zoneId, config)).find(
      (candidate) => candidate.name === record.name && candidate.type === record.type,
    );
    const payload = recordPayload(record, config);

    if (existing) {
      const { result } = await cfRequest<CloudflareDnsRecord>(
        `/zones/${zoneId}/dns_records/${existing.id}`,
        { method: 'PUT', body: JSON.stringify(payload) },
        'Cloudflare upsertRecord (update)',
      );
      return toDnsRecord(zoneId, result);
    }

    const { result } = await cfRequest<CloudflareDnsRecord>(
      `/zones/${zoneId}/dns_records`,
      { method: 'POST', body: JSON.stringify(payload) },
      'Cloudflare upsertRecord (create)',
    );
    return toDnsRecord(zoneId, result);
  },

  async deleteRecord(zoneId, recordId) {
    const res = await fetch(`${API}/zones/${zoneId}/dns_records/${recordId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      throw new Error(errorMessage('Cloudflare deleteRecord', res.status, text));
    }
  },

  async syncRoundRobin({ zoneId, name, ips, ttl, proxied }, config) {
    const ttlFinal = ttl ?? config.defaultTtl ?? 60;
    const proxiedFinal = proxied ?? config.defaultProxied ?? false;
    const desired = [...new Set(ips)];
    const existing = (await this.listRecords(zoneId, config)).filter(
      (record) => record.name === name && record.type === 'A',
    );
    const kept = new Map<string, DnsRecord>();
    const extraIds: string[] = [];

    for (const record of existing) {
      if (desired.includes(record.value) && !kept.has(record.value)) {
        kept.set(record.value, record);
      } else {
        extraIds.push(record.id);
      }
    }

    await Promise.all(extraIds.map((recordId) => this.deleteRecord(zoneId, recordId, config)));

    const synced: DnsRecord[] = [];
    for (const ip of desired) {
      const current = kept.get(ip);
      if (current && current.ttl === ttlFinal && current.proxied === proxiedFinal) {
        synced.push(current);
        continue;
      }

      const payload = {
        type: 'A',
        name,
        content: ip,
        ttl: ttlFinal,
        proxied: proxiedFinal,
      };

      if (current) {
        const { result } = await cfRequest<CloudflareDnsRecord>(
          `/zones/${zoneId}/dns_records/${current.id}`,
          { method: 'PUT', body: JSON.stringify(payload) },
          'Cloudflare syncRoundRobin (update)',
        );
        synced.push(toDnsRecord(zoneId, result));
      } else {
        const { result } = await cfRequest<CloudflareDnsRecord>(
          `/zones/${zoneId}/dns_records`,
          { method: 'POST', body: JSON.stringify(payload) },
          'Cloudflare syncRoundRobin (create)',
        );
        synced.push(toDnsRecord(zoneId, result));
      }
    }

    return synced;
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
