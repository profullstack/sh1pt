import { defineDns, type DnsRecord } from '@profullstack/sh1pt-core';

// DNSimple API v2. Auth: Bearer OAuth token or personal access token.
// Core DNS endpoints:
//   GET    /:account/zones
//   GET    /:account/zones/:zone/records
//   POST   /:account/zones/:zone/records
//   PATCH  /:account/zones/:zone/records/:record
//   DELETE /:account/zones/:zone/records/:record
interface Config {
  accountId?: string;
  baseUrl?: string;
  defaultTtl?: number;
  pageSize?: number;
}

const DEFAULT_API = 'https://api.dnsimple.com/v2';
let _secret: (key: string) => string | undefined = () => undefined;

type DnsimplePagination = {
  current_page?: number;
  total_pages?: number;
};

type DnsimpleRecord = {
  id: number | string;
  name: string;
  type: string;
  content: string;
  ttl?: number | null;
};

type DnsimplePage<T> = {
  data?: T[];
  pagination?: DnsimplePagination;
};

type DnsimpleItem<T> = {
  data?: T;
  message?: string;
  errors?: unknown;
};

function baseUrl(config: Config): string {
  return (config.baseUrl ?? DEFAULT_API).replace(/\/+$/, '');
}

function token(): string | undefined {
  return _secret('DNSIMPLE_API_TOKEN');
}

function hasToken(): boolean {
  return !!token();
}

function authHeader(): Record<string, string> {
  const apiToken = token();
  if (!apiToken) {
    throw new Error('DNSIMPLE_API_TOKEN not in vault - run `sh1pt secret set DNSIMPLE_API_TOKEN ...`');
  }
  return {
    Authorization: `Bearer ${apiToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

function ttlValue(ttl: number | undefined, config: Config): number {
  return ttl ?? config.defaultTtl ?? 3600;
}

function pageSize(config: Config): number {
  return config.pageSize ?? 100;
}

function normalizeRecordName(zoneId: string, name: string): string {
  const trimmed = name.replace(/\.$/, '');
  if (!trimmed || trimmed === '@') return zoneId;
  if (trimmed === zoneId || trimmed.endsWith(`.${zoneId}`)) return trimmed;
  return `${trimmed}.${zoneId}`;
}

function toDnsimpleName(zoneId: string, name: string): string {
  const normalized = normalizeRecordName(zoneId, name);
  if (normalized === zoneId) return '';
  return normalized.slice(0, -(zoneId.length + 1));
}

function mapRecord(zoneId: string, record: DnsimpleRecord, config: Config): DnsRecord {
  return {
    id: String(record.id),
    zone: zoneId,
    name: normalizeRecordName(zoneId, record.name),
    type: record.type as DnsRecord['type'],
    value: record.content,
    ttl: record.ttl ?? ttlValue(undefined, config),
  };
}

function errorDetail(payload: DnsimpleItem<unknown>, fallback: string): string {
  if (payload.message) return payload.message;
  if (payload.errors) return JSON.stringify(payload.errors).slice(0, 200);
  return fallback;
}

async function dnsimpleRequest<T>(
  config: Config,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${baseUrl(config)}${path}`, {
    ...init,
    headers: {
      ...authHeader(),
      ...init.headers,
    },
  });
  const text = await res.text();
  let payload: DnsimpleItem<T>;
  try {
    payload = text ? JSON.parse(text) as DnsimpleItem<T> : {};
  } catch {
    payload = { message: text.slice(0, 200) };
  }

  if (!res.ok) {
    throw new Error(`DNSimple ${res.status}: ${errorDetail(payload, text.slice(0, 200))}`);
  }

  return payload as T;
}

async function resolveAccountId(config: Config): Promise<string> {
  if (config.accountId) return config.accountId;
  const { data } = await dnsimpleRequest<{ data?: { account?: { id: number | string } } }>(config, '/whoami');
  if (!data?.account?.id) {
    throw new Error('DNSimple: token did not resolve an account id');
  }
  return String(data.account.id);
}

async function listPaged<T>(config: Config, path: string): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const separator = path.includes('?') ? '&' : '?';
    const response = await dnsimpleRequest<DnsimplePage<T>>(
      config,
      `${path}${separator}per_page=${pageSize(config)}&page=${page}`,
    );
    items.push(...(response.data ?? []));
    totalPages = response.pagination?.total_pages ?? page;
    page += 1;
  } while (page <= totalPages);

  return items;
}

async function createRecord(
  zoneId: string,
  record: Omit<DnsRecord, 'id'>,
  config: Config,
): Promise<DnsRecord> {
  const accountId = await resolveAccountId(config);
  const ttl = ttlValue(record.ttl, config);
  const response = await dnsimpleRequest<DnsimpleItem<DnsimpleRecord>>(
    config,
    `/${encodeURIComponent(accountId)}/zones/${encodeURIComponent(zoneId)}/records`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: toDnsimpleName(zoneId, record.name),
        type: record.type,
        content: record.value,
        ttl,
      }),
    },
  );
  return response.data
    ? mapRecord(zoneId, response.data, config)
    : { ...record, id: '', zone: zoneId, name: normalizeRecordName(zoneId, record.name), ttl };
}

async function editRecord(
  zoneId: string,
  recordId: string,
  record: Omit<DnsRecord, 'id'>,
  config: Config,
): Promise<DnsRecord> {
  const accountId = await resolveAccountId(config);
  const ttl = ttlValue(record.ttl, config);
  const response = await dnsimpleRequest<DnsimpleItem<DnsimpleRecord>>(
    config,
    `/${encodeURIComponent(accountId)}/zones/${encodeURIComponent(zoneId)}/records/${encodeURIComponent(recordId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        name: toDnsimpleName(zoneId, record.name),
        content: record.value,
        ttl,
      }),
    },
  );
  return response.data
    ? mapRecord(zoneId, response.data, config)
    : { ...record, id: recordId, zone: zoneId, name: normalizeRecordName(zoneId, record.name), ttl };
}

export default defineDns<Config>({
  id: 'dns-dnsimple',
  label: 'DNSimple',

  async connect(ctx) {
    _secret = (key) => ctx.secret(key);
    if (!ctx.secret('DNSIMPLE_API_TOKEN')) {
      throw new Error('DNSIMPLE_API_TOKEN not in vault - run `sh1pt secret set DNSIMPLE_API_TOKEN ...`');
    }
    ctx.log('dnsimple connected');
    return { accountId: 'dnsimple' };
  },

  async listZones(config) {
    const accountId = await resolveAccountId(config);
    const zones = await listPaged<{ id: number | string; name: string }>(
      config,
      `/${encodeURIComponent(accountId)}/zones`,
    );
    return zones.map((zone) => ({ id: zone.name, name: zone.name }));
  },

  async listRecords(zoneId, config) {
    const accountId = await resolveAccountId(config);
    const records = await listPaged<DnsimpleRecord>(
      config,
      `/${encodeURIComponent(accountId)}/zones/${encodeURIComponent(zoneId)}/records`,
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
    const accountId = await resolveAccountId(config);
    const res = await fetch(
      `${baseUrl(config)}/${encodeURIComponent(accountId)}/zones/${encodeURIComponent(zoneId)}/records/${encodeURIComponent(recordId)}`,
      {
        method: 'DELETE',
        headers: authHeader(),
      },
    );
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      throw new Error(`DNSimple deleteRecord ${res.status}: ${text.slice(0, 200)}`);
    }
  },

  async syncRoundRobin({ zoneId, name, ips, ttl }, config) {
    const ttlFinal = ttlValue(ttl, config);
    const normalizedName = normalizeRecordName(zoneId, name);
    const desiredIps = [...new Set(ips)];

    if (!hasToken()) {
      return desiredIps.map((ip, index) => ({
        id: `dnsimple-rr-${index}`,
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
