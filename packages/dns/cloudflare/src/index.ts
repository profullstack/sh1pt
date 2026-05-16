import { defineDns, tokenSetup, type DnsRecord } from '@profullstack/sh1pt-core';

// Cloudflare DNS API v4. Auth: Bearer token scoped to Zone.DNS:Edit.
// Endpoints: /client/v4/zones, /client/v4/zones/:id/dns_records
// Cloudflare's "orange cloud" (proxied=true) routes traffic through the
// CF edge. Disable it for raw VPS round-robin records unless the fleet
// can terminate TLS behind Cloudflare.
interface Config {
  accountId?: string;
  defaultTtl?: number;           // 1 = auto; otherwise >= 60
  defaultProxied?: boolean;
}

interface CloudflareError {
  code?: number;
  message?: string;
}

interface CloudflareResponse<T> {
  success: boolean;
  errors?: CloudflareError[];
  messages?: CloudflareError[];
  result: T;
  result_info?: {
    page?: number;
    total_pages?: number;
  };
}

interface CloudflareZone {
  id: string;
  name: string;
}

interface CloudflareRecord {
  id: string;
  zone_id?: string;
  zone_name?: string;
  name: string;
  type: DnsRecord['type'];
  content: string;
  ttl: number;
  proxied?: boolean;
}

const API = 'https://api.cloudflare.com/client/v4';
let _secret: (k: string) => string | undefined = () => undefined;
const _zoneNames = new Map<string, string>();

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${_secret('CLOUDFLARE_API_TOKEN')}` };
}

export default defineDns<Config>({
  id: 'dns-cloudflare',
  label: 'Cloudflare DNS',

  async connect(ctx) {
    _secret = (k) => ctx.secret(k);
    if (!ctx.secret('CLOUDFLARE_API_TOKEN')) {
      throw new Error('CLOUDFLARE_API_TOKEN not set - run `sh1pt secret set CLOUDFLARE_API_TOKEN ...`');
    }
    ctx.log('cloudflare dns connected');
    return { accountId: 'cloudflare' };
  },

  async listZones(config) {
    const account = config.accountId ? `&account.id=${encodeURIComponent(config.accountId)}` : '';
    const zones = await listAll<CloudflareZone>(`/zones?per_page=100${account}`);
    for (const zone of zones) _zoneNames.set(zone.id, zone.name);
    return zones.map((zone) => ({ id: zone.id, name: zone.name }));
  },

  async listRecords(zoneId) {
    const records = await listAll<CloudflareRecord>(`/zones/${encodeURIComponent(zoneId)}/dns_records?per_page=100`);
    return records.map((record) => toDnsRecord(zoneId, record));
  },

  async upsertRecord(zoneId, record, config) {
    const existing = await this.listRecords(zoneId, config);
    const zoneName = _zoneNames.get(zoneId) ?? await resolveZoneName(zoneId);
    const targetName = formatRecordName(record.name, zoneName);
    const match = existing.find((candidate) =>
      candidate.type === record.type && sameRecordName(candidate.name, record.name, zoneName)
    );
    const payload = toCloudflarePayload({
      ...record,
      name: targetName,
      ttl: record.ttl ?? config.defaultTtl ?? 1,
      proxied: record.proxied ?? config.defaultProxied,
    });

    if (match) {
      const updated = await request<CloudflareRecord>(
        `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(match.id)}`,
        { method: 'PUT', body: JSON.stringify(payload) },
      );
      return toDnsRecord(zoneId, updated.result);
    }

    const created = await createRecord(zoneId, payload);
    return toDnsRecord(zoneId, created);
  },

  async deleteRecord(zoneId, recordId) {
    await request<{ id: string }>(
      `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`,
      { method: 'DELETE' },
      { allowNotFound: true },
    );
  },

  async syncRoundRobin({ zoneId, name, ips, ttl, proxied }, config) {
    const existing = await this.listRecords(zoneId, config);
    const zoneName = _zoneNames.get(zoneId) ?? await resolveZoneName(zoneId);
    const desired = new Set(ips);
    const seen = new Set<string>();
    const kept: DnsRecord[] = [];
    const current = existing.filter((record) =>
      record.type === 'A' && sameRecordName(record.name, name, zoneName)
    );

    for (const record of current) {
      if (desired.has(record.value) && !seen.has(record.value)) {
        seen.add(record.value);
        kept.push(record);
      } else {
        await this.deleteRecord(zoneId, record.id, config);
      }
    }

    const targetName = formatRecordName(name, zoneName);
    const ttlFinal = ttl ?? config.defaultTtl ?? 1;
    const proxiedFinal = proxied ?? config.defaultProxied;
    const created: DnsRecord[] = [];
    for (const ip of ips) {
      if (seen.has(ip)) continue;
      const record = await createRecord(zoneId, toCloudflarePayload({
        zone: zoneId,
        name: targetName,
        type: 'A',
        value: ip,
        ttl: ttlFinal,
        proxied: proxiedFinal,
      }));
      created.push(toDnsRecord(zoneId, record));
    }

    return [...kept, ...created];
  },

  setup: tokenSetup<Config>({
    secretKey: 'CLOUDFLARE_API_TOKEN',
    label: 'Cloudflare DNS',
    vendorDocUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    steps: [
      'Open dash.cloudflare.com -> My Profile -> API Tokens -> Create Token',
      'Use the "Edit zone DNS" template (or custom with Zone.DNS:Edit)',
      'Scope to the zones sh1pt should manage -> Continue -> Create -> copy the token',
    ],
  }),
});

async function listAll<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const sep = path.includes('?') ? '&' : '?';
    const response = await request<T[]>(`${path}${sep}page=${page}`);
    items.push(...response.result);
    totalPages = response.result_info?.total_pages ?? page;
    page += 1;
  } while (page <= totalPages);
  return items;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  opts: { allowNotFound?: boolean } = {},
): Promise<CloudflareResponse<T>> {
  const headers = {
    ...authHeaders(),
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (opts.allowNotFound && res.status === 404) {
    return { success: true, result: undefined as T };
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) as CloudflareResponse<T> : { success: res.ok, result: undefined as T };
  if (!res.ok || data.success === false) {
    const message = data.errors?.map((err) => err.message).filter(Boolean).join('; ') || res.statusText;
    throw new Error(`Cloudflare ${res.status}: ${message}`);
  }
  return data;
}

async function resolveZoneName(zoneId: string): Promise<string | undefined> {
  if (_zoneNames.has(zoneId)) return _zoneNames.get(zoneId);
  const zone = await request<CloudflareZone>(`/zones/${encodeURIComponent(zoneId)}`);
  if (zone.result?.name) _zoneNames.set(zoneId, zone.result.name);
  return zone.result?.name;
}

async function createRecord(zoneId: string, payload: Record<string, unknown>): Promise<CloudflareRecord> {
  const created = await request<CloudflareRecord>(
    `/zones/${encodeURIComponent(zoneId)}/dns_records`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
  return created.result;
}

function toCloudflarePayload(record: Omit<DnsRecord, 'id'>): Record<string, unknown> {
  return {
    type: record.type,
    name: record.name,
    content: record.value,
    ttl: record.ttl,
    ...(record.proxied !== undefined ? { proxied: record.proxied } : {}),
  };
}

function toDnsRecord(zoneId: string, record: CloudflareRecord): DnsRecord {
  if (record.zone_id && record.zone_name) _zoneNames.set(record.zone_id, record.zone_name);
  return {
    id: record.id,
    zone: record.zone_id ?? zoneId,
    name: record.name,
    type: record.type,
    value: record.content,
    ttl: record.ttl,
    proxied: record.proxied,
  };
}

function formatRecordName(name: string, zoneName?: string): string {
  if (name === '@') return zoneName ?? name;
  if (!zoneName || name.includes('.')) return name;
  return `${name}.${zoneName}`;
}

function sameRecordName(recordName: string, requestedName: string, zoneName?: string): boolean {
  return recordName === requestedName || recordName === formatRecordName(requestedName, zoneName);
}

