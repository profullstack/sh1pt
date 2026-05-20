import { defineDns, tokenSetup, type DnsRecord } from '@profullstack/sh1pt-core';

// Porkbun DNS API (v3). Auth is API key + secret (not OAuth). Endpoints:
//   POST /api/json/v3/dns/retrieve/:domain
//   POST /api/json/v3/dns/create/:domain
//   POST /api/json/v3/dns/edit/:domain/:id
//   POST /api/json/v3/dns/delete/:domain/:id
// Calls use the API key + secret from the sh1pt vault.
interface Config {
  // credentials pulled from secrets vault:
  //   PORKBUN_API_KEY, PORKBUN_API_SECRET
  baseUrl?: string;
  defaultTtl?: number;
}

const DEFAULT_API = 'https://api.porkbun.com/api/json/v3';
let _secret: (key: string) => string | undefined = () => undefined;

type PorkbunRecord = {
  id: string | number;
  name: string;
  type: string;
  content: string;
  ttl?: string | number | null;
};

type PorkbunResponse = {
  status?: string;
  message?: string;
  code?: string;
  count?: number;
  domains?: Array<{ domain: string }>;
  records?: PorkbunRecord[];
  id?: string | number;
};

function baseUrl(config: Config): string {
  return (config.baseUrl ?? DEFAULT_API).replace(/\/+$/, '');
}

function credentials() {
  const apikey = _secret('PORKBUN_API_KEY');
  const secretapikey = _secret('PORKBUN_API_SECRET');
  if (!apikey || !secretapikey) {
    throw new Error('PORKBUN_API_KEY / PORKBUN_API_SECRET not in vault - run `sh1pt secret set PORKBUN_API_KEY ...`');
  }
  return { apikey, secretapikey };
}

function hasCredentials(): boolean {
  return !!_secret('PORKBUN_API_KEY') && !!_secret('PORKBUN_API_SECRET');
}

function normalizeRecordName(zoneId: string, name: string): string {
  const trimmed = name.replace(/\.$/, '');
  if (!trimmed || trimmed === '@') return zoneId;
  if (trimmed === zoneId || trimmed.endsWith(`.${zoneId}`) || trimmed.includes('.')) return trimmed;
  return `${trimmed}.${zoneId}`;
}

function toPorkbunName(zoneId: string, name: string): string {
  const normalized = normalizeRecordName(zoneId, name);
  if (normalized === zoneId) return '';
  return normalized.endsWith(`.${zoneId}`)
    ? normalized.slice(0, -(zoneId.length + 1))
    : normalized;
}

function ttlValue(ttl: number | undefined, config: Config): number {
  return ttl ?? config.defaultTtl ?? 600;
}

function mapRecord(zoneId: string, record: PorkbunRecord, config: Config): DnsRecord {
  const ttl = Number(record.ttl);
  return {
    id: String(record.id),
    zone: zoneId,
    name: normalizeRecordName(zoneId, record.name),
    type: record.type as DnsRecord['type'],
    value: record.content,
    ttl: Number.isFinite(ttl) && ttl > 0 ? ttl : ttlValue(undefined, config),
  };
}

function sameRecord(zoneId: string, left: DnsRecord, right: Omit<DnsRecord, 'id'>): boolean {
  return left.type === right.type
    && normalizeRecordName(zoneId, left.name) === normalizeRecordName(zoneId, right.name);
}

async function porkbunRequest<T extends PorkbunResponse>(
  config: Config,
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`${baseUrl(config)}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...credentials(), ...body }),
  });
  const text = await res.text();
  let data: PorkbunResponse;
  try {
    data = text ? JSON.parse(text) as PorkbunResponse : {};
  } catch {
    data = { status: 'ERROR', message: text.slice(0, 200) };
  }

  if (!res.ok || data.status === 'ERROR') {
    const code = data.code ? ` ${data.code}` : '';
    const detail = data.message ?? text.slice(0, 200) ?? 'request failed';
    throw new Error(`Porkbun${code} ${res.status}: ${detail}`);
  }

  return data as T;
}

async function createRecord(
  zoneId: string,
  record: Omit<DnsRecord, 'id'>,
  config: Config,
): Promise<DnsRecord> {
  const ttl = ttlValue(record.ttl, config);
  const data = await porkbunRequest<{ id?: string | number }>(config, `/dns/create/${encodeURIComponent(zoneId)}`, {
    name: toPorkbunName(zoneId, record.name),
    type: record.type,
    content: record.value,
    ttl,
  });
  return {
    ...record,
    id: String(data.id ?? ''),
    zone: zoneId,
    name: normalizeRecordName(zoneId, record.name),
    ttl,
  };
}

async function editRecord(
  zoneId: string,
  recordId: string,
  record: Omit<DnsRecord, 'id'>,
  config: Config,
): Promise<DnsRecord> {
  const ttl = ttlValue(record.ttl, config);
  await porkbunRequest(config, `/dns/edit/${encodeURIComponent(zoneId)}/${encodeURIComponent(recordId)}`, {
    name: toPorkbunName(zoneId, record.name),
    type: record.type,
    content: record.value,
    ttl,
  });
  return {
    ...record,
    id: recordId,
    zone: zoneId,
    name: normalizeRecordName(zoneId, record.name),
    ttl,
  };
}

export default defineDns<Config>({
  id: 'dns-porkbun',
  label: 'Porkbun DNS',

  async connect(ctx) {
    _secret = (key) => ctx.secret(key);
    if (!ctx.secret('PORKBUN_API_KEY') || !ctx.secret('PORKBUN_API_SECRET')) {
      throw new Error('PORKBUN_API_KEY / PORKBUN_API_SECRET not in vault - run `sh1pt secret set PORKBUN_API_KEY ...`');
    }
    ctx.log('porkbun connected');
    return { accountId: 'porkbun' };
  },

  async listZones(config) {
    const zones: { id: string; name: string }[] = [];
    let start = 0;
    let pageCount = 0;

    do {
      const data = await porkbunRequest(config, '/domain/listAll', {
        start,
        includeLabels: 'no',
        apiAccess: 'yes',
      });
      const domains = data.domains ?? [];
      zones.push(...domains.map((domain) => ({
        id: domain.domain,
        name: domain.domain,
      })));
      pageCount = domains.length;
      start += pageCount;
    } while (pageCount === 1000);

    return zones;
  },

  async listRecords(zoneId, config) {
    const data = await porkbunRequest<{ records?: PorkbunRecord[] }>(
      config,
      `/dns/retrieve/${encodeURIComponent(zoneId)}`,
    );
    return (data.records ?? []).map((record) => mapRecord(zoneId, record, config));
  },

  async upsertRecord(zoneId, record, config) {
    const existing = (await this.listRecords(zoneId, config)).find((candidate) => (
      sameRecord(zoneId, candidate, record)
    ));

    if (existing) {
      return editRecord(zoneId, existing.id, record, config);
    }

    return createRecord(zoneId, record, config);
  },

  async deleteRecord(zoneId, recordId, config) {
    await porkbunRequest(config, `/dns/delete/${encodeURIComponent(zoneId)}/${encodeURIComponent(recordId)}`);
  },

  async syncRoundRobin({ zoneId, name, ips, ttl }, config) {
    const ttlFinal = ttlValue(ttl, config);
    const desiredIps = [...new Set(ips)];
    if (!hasCredentials()) {
      return desiredIps.map((ip, index) => ({
        id: `porkbun-rr-${index}`,
        zone: zoneId,
        name: normalizeRecordName(zoneId, name),
        type: 'A' as const,
        value: ip,
        ttl: ttlFinal,
      })) satisfies DnsRecord[];
    }

    const desired = new Set(desiredIps);
    const current = (await this.listRecords(zoneId, config)).filter((record) => (
      record.type === 'A' && normalizeRecordName(zoneId, record.name) === normalizeRecordName(zoneId, name)
    ));
    const kept = new Map<string, DnsRecord>();

    for (const record of current) {
      if (desired.has(record.value) && !kept.has(record.value)) {
        const normalized = { ...record, name: normalizeRecordName(zoneId, name), ttl: ttlFinal };
        const next = record.ttl === ttlFinal
          ? normalized
          : await editRecord(zoneId, record.id, {
            zone: zoneId,
            name,
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
          name,
          type: 'A',
          value: ip,
          ttl: ttlFinal,
        }, config));
      }
    }

    return desiredIps.map((ip) => kept.get(ip)).filter((record): record is DnsRecord => !!record);
  },

  setup: tokenSetup<Config>({
    secretKey: 'PORKBUN_API_KEY',
    label: 'Porkbun DNS',
    vendorDocUrl: 'https://porkbun.com/api/json/v3/documentation',
    steps: [
      'Open porkbun.com → Account → API Access',
      'Enable API access for each domain sh1pt should manage',
      'Create API credentials → copy both the API Key and Secret API Key',
      'Paste API Key when prompted; the secret you will enter on the next prompt',
    ],
    fields: [
      { key: 'PORKBUN_API_SECRET', message: 'Paste the Porkbun Secret API Key:', secret: true, required: true },
    ],
  }),
});
