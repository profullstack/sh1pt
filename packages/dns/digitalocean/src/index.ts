import { defineDns, type DnsRecord } from '@profullstack/sh1pt-core';

// DigitalOcean DNS API v2. Auth: Bearer personal access token.
// Core endpoints:
//   GET    /v2/domains
//   GET    /v2/domains/:domain/records
//   POST   /v2/domains/:domain/records
//   PUT    /v2/domains/:domain/records/:id
//   DELETE /v2/domains/:domain/records/:id
interface Config {
  baseUrl?: string;
  defaultTtl?: number;
  pageSize?: number;
}

const DEFAULT_API = 'https://api.digitalocean.com/v2';
let _secret: (key: string) => string | undefined = () => undefined;

type DigitalOceanLinks = {
  pages?: {
    next?: string;
  };
};

type DigitalOceanDomain = {
  name: string;
};

type DigitalOceanRecord = {
  id: number | string;
  name: string;
  type: string;
  data: string;
  ttl?: number | null;
};

type DigitalOceanListResponse = Record<string, unknown> & {
  links?: DigitalOceanLinks;
};

function baseUrl(config: Config): string {
  return (config.baseUrl ?? DEFAULT_API).replace(/\/+$/, '');
}

function token(): string | undefined {
  return _secret('DO_API_TOKEN');
}

function hasToken(): boolean {
  return !!token();
}

function authHeader(): Record<string, string> {
  const apiToken = token();
  if (!apiToken) {
    throw new Error('DO_API_TOKEN not in vault - run `sh1pt secret set DO_API_TOKEN ...`');
  }
  return { Authorization: `Bearer ${apiToken}` };
}

function jsonHeader(): Record<string, string> {
  return { ...authHeader(), 'Content-Type': 'application/json' };
}

function ttlValue(ttl: number | undefined, config: Config): number {
  return ttl ?? config.defaultTtl ?? 1800;
}

function pageSize(config: Config): number {
  return config.pageSize ?? 200;
}

function normalizeRecordName(zoneId: string, name: string): string {
  const trimmed = name.replace(/\.$/, '');
  if (!trimmed || trimmed === '@') return zoneId;
  if (trimmed === zoneId || trimmed.endsWith(`.${zoneId}`)) return trimmed;
  return `${trimmed}.${zoneId}`;
}

function toDigitalOceanName(zoneId: string, name: string): string {
  const normalized = normalizeRecordName(zoneId, name);
  if (normalized === zoneId) return '@';
  return normalized.slice(0, -(zoneId.length + 1));
}

function errorDetail(payload: Record<string, unknown>, fallback: string): string {
  const message = payload.message ?? payload.id;
  if (typeof message === 'string') return message;
  return fallback;
}

function mapRecord(zoneId: string, record: DigitalOceanRecord, config: Config): DnsRecord {
  return {
    id: String(record.id),
    zone: zoneId,
    name: normalizeRecordName(zoneId, record.name),
    type: record.type as DnsRecord['type'],
    value: record.data,
    ttl: record.ttl ?? ttlValue(undefined, config),
  };
}

async function digitalOceanRequest<T>(
  config: Config,
  pathOrUrl: string,
  init: RequestInit = {},
): Promise<T> {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${baseUrl(config)}${pathOrUrl}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...authHeader(),
      ...init.headers,
    },
  });
  const text = await res.text();
  let payload: Record<string, unknown>;
  try {
    payload = text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    payload = { message: text.slice(0, 200) };
  }

  if (!res.ok) {
    throw new Error(`DigitalOcean ${res.status}: ${errorDetail(payload, text.slice(0, 200))}`);
  }

  return payload as T;
}

async function listAll<T>(
  config: Config,
  path: string,
  key: string,
): Promise<T[]> {
  const separator = path.includes('?') ? '&' : '?';
  let next: string | undefined = `${path}${separator}per_page=${pageSize(config)}`;
  const items: T[] = [];

  while (next) {
    const response: DigitalOceanListResponse = await digitalOceanRequest<DigitalOceanListResponse>(
      config,
      next,
    );
    const page = response[key];
    if (Array.isArray(page)) items.push(...page as T[]);
    next = response.links?.pages?.next;
  }

  return items;
}

async function createRecord(
  zoneId: string,
  record: Omit<DnsRecord, 'id'>,
  config: Config,
): Promise<DnsRecord> {
  const ttl = ttlValue(record.ttl, config);
  const response = await digitalOceanRequest<{ domain_record?: DigitalOceanRecord }>(
    config,
    `/domains/${encodeURIComponent(zoneId)}/records`,
    {
      method: 'POST',
      headers: jsonHeader(),
      body: JSON.stringify({
        type: record.type,
        name: toDigitalOceanName(zoneId, record.name),
        data: record.value,
        ttl,
      }),
    },
  );
  return response.domain_record
    ? mapRecord(zoneId, response.domain_record, config)
    : { ...record, id: '', zone: zoneId, name: normalizeRecordName(zoneId, record.name), ttl };
}

async function editRecord(
  zoneId: string,
  recordId: string,
  record: Omit<DnsRecord, 'id'>,
  config: Config,
): Promise<DnsRecord> {
  const ttl = ttlValue(record.ttl, config);
  const response = await digitalOceanRequest<{ domain_record?: DigitalOceanRecord }>(
    config,
    `/domains/${encodeURIComponent(zoneId)}/records/${encodeURIComponent(recordId)}`,
    {
      method: 'PUT',
      headers: jsonHeader(),
      body: JSON.stringify({
        type: record.type,
        name: toDigitalOceanName(zoneId, record.name),
        data: record.value,
        ttl,
      }),
    },
  );
  return response.domain_record
    ? mapRecord(zoneId, response.domain_record, config)
    : { ...record, id: recordId, zone: zoneId, name: normalizeRecordName(zoneId, record.name), ttl };
}

export default defineDns<Config>({
  id: 'dns-digitalocean',
  label: 'DigitalOcean DNS',

  async connect(ctx) {
    _secret = (key) => ctx.secret(key);
    if (!ctx.secret('DO_API_TOKEN')) {
      throw new Error('DO_API_TOKEN not in vault - run `sh1pt secret set DO_API_TOKEN ...`');
    }
    ctx.log('digitalocean dns connected');
    return { accountId: 'digitalocean' };
  },

  async listZones(config) {
    const domains = await listAll<DigitalOceanDomain>(config, '/domains', 'domains');
    return domains.map((domain) => ({ id: domain.name, name: domain.name }));
  },

  async listRecords(zoneId, config) {
    const records = await listAll<DigitalOceanRecord>(
      config,
      `/domains/${encodeURIComponent(zoneId)}/records`,
      'domain_records',
    );
    return records.map((record) => mapRecord(zoneId, record, config));
  },

  async upsertRecord(zoneId, record, config) {
    const existing = (await this.listRecords(zoneId, config)).find((candidate) => (
      candidate.type === record.type
      && normalizeRecordName(zoneId, candidate.name) === normalizeRecordName(zoneId, record.name)
    ));

    if (existing) {
      return editRecord(zoneId, existing.id, record, config);
    }

    return createRecord(zoneId, record, config);
  },

  async deleteRecord(zoneId, recordId, config) {
    const res = await fetch(
      `${baseUrl(config)}/domains/${encodeURIComponent(zoneId)}/records/${encodeURIComponent(recordId)}`,
      {
        method: 'DELETE',
        headers: authHeader(),
      },
    );
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      throw new Error(`DigitalOcean deleteRecord ${res.status}: ${text.slice(0, 200)}`);
    }
  },

  async syncRoundRobin({ zoneId, name, ips, ttl }, config) {
    const ttlFinal = ttlValue(ttl, config);
    const normalizedName = normalizeRecordName(zoneId, name);
    const desiredIps = [...new Set(ips)];

    if (!hasToken()) {
      return desiredIps.map((ip, index) => ({
        id: `do-rr-${index}`,
        zone: zoneId,
        name: normalizedName,
        type: 'A' as const,
        value: ip,
        ttl: ttlFinal,
      })) satisfies DnsRecord[];
    }

    const desired = new Set(desiredIps);
    const current = (await this.listRecords(zoneId, config)).filter((record) => (
      record.type === 'A' && normalizeRecordName(zoneId, record.name) === normalizedName
    ));
    const kept = new Map<string, DnsRecord>();

    for (const record of current) {
      if (desired.has(record.value) && !kept.has(record.value)) {
        const next = record.ttl === ttlFinal && record.name === normalizedName
          ? { ...record, ttl: ttlFinal }
          : await editRecord(zoneId, record.id, {
            zone: zoneId,
            name: normalizedName,
            type: 'A',
            value: record.value,
            ttl: ttlFinal,
          }, config);
        kept.set(record.value, next);
      } else {
        await this.deleteRecord(zoneId, record.id, config);
      }
    }

    for (const ip of desiredIps) {
      if (!kept.has(ip)) {
        kept.set(ip, await createRecord(zoneId, {
          zone: zoneId,
          name: normalizedName,
          type: 'A',
          value: ip,
          ttl: ttlFinal,
        }, config));
      }
    }

    return desiredIps.map((ip) => kept.get(ip)).filter((record): record is DnsRecord => !!record);
  },
});
