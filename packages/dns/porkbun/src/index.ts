import { defineDns, tokenSetup, type DnsRecord } from '@profullstack/sh1pt-core';

// Porkbun DNS API (v3). Auth is API key + secret (not OAuth). Endpoints:
//   POST /api/json/v3/dns/retrieve/:domain
//   POST /api/json/v3/dns/create/:domain
//   POST /api/json/v3/dns/edit/:domain/:id
//   POST /api/json/v3/dns/delete/:domain/:id
// Every call posts the api key + secret in the JSON body.
interface Config {
  // credentials pulled from secrets vault:
  //   PORKBUN_API_KEY, PORKBUN_API_SECRET
  defaultTtl?: number;
}

const API = 'https://api.porkbun.com/api/json/v3';
let _secret: (k: string) => string | undefined = () => undefined;

interface PorkbunRecord {
  id: string | number;
  name: string;
  type: string;
  content: string;
  ttl: string | number;
  prio?: string | number;
}

interface PorkbunResponse {
  status: string;
  message?: string;
  id?: string | number;
  records?: PorkbunRecord[];
}

function credentials() {
  const apikey = _secret('PORKBUN_API_KEY');
  const secretapikey = _secret('PORKBUN_API_SECRET');
  if (!apikey || !secretapikey) {
    throw new Error('PORKBUN_API_KEY / PORKBUN_API_SECRET not set');
  }
  return { apikey, secretapikey };
}

function supportedType(type: string): type is DnsRecord['type'] {
  return type === 'A' || type === 'AAAA' || type === 'CNAME' || type === 'TXT' || type === 'MX';
}

function relativeName(zoneId: string, name: string): string {
  if (name === zoneId || name === '@' || name === '') return '';
  return name.endsWith(`.${zoneId}`) ? name.slice(0, -(zoneId.length + 1)) : name;
}

function nameMatches(zoneId: string, actual: string, requested: string): boolean {
  if (actual === requested) return true;
  if (requested === '@' || requested === '') return actual === zoneId;
  return actual === `${requested}.${zoneId}`;
}

function toDnsRecord(zoneId: string, record: PorkbunRecord): DnsRecord | undefined {
  if (!supportedType(record.type)) return undefined;
  return {
    id: String(record.id),
    zone: zoneId,
    name: record.name,
    type: record.type,
    value: record.content,
    ttl: Number(record.ttl),
  };
}

function recordBody(zoneId: string, record: Omit<DnsRecord, 'id'>, ttl: number) {
  return {
    name: relativeName(zoneId, record.name),
    type: record.type,
    content: record.value,
    ttl,
  };
}

async function porkbunRequest(path: string, body: Record<string, unknown> = {}, operation = 'Porkbun request'): Promise<PorkbunResponse> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...credentials(), ...body }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${operation}: ${res.status}${text ? ` ${text.slice(0, 200)}` : ''}`);

  const json = JSON.parse(text) as PorkbunResponse;
  if (json.status !== 'SUCCESS') {
    throw new Error(`${operation}: ${json.message ?? json.status}`);
  }
  return json;
}

export default defineDns<Config>({
  id: 'dns-porkbun',
  label: 'Porkbun DNS',

  async connect(ctx) {
    _secret = (k) => ctx.secret(k);
    if (!ctx.secret('PORKBUN_API_KEY') || !ctx.secret('PORKBUN_API_SECRET')) {
      throw new Error('PORKBUN_API_KEY / PORKBUN_API_SECRET not set — run `sh1pt secret set PORKBUN_API_KEY ...`');
    }
    ctx.log('porkbun connected');
    return { accountId: 'porkbun' };
  },

  async listZones() {
    // Porkbun has no "list all domains" endpoint in the public v3 API — users
    // manage one zone at a time. sh1pt treats declared domains as zones.
    return [];
  },

  async listRecords(zoneId) {
    const { records = [] } = await porkbunRequest(
      `/dns/retrieve/${encodeURIComponent(zoneId)}`,
      {},
      'Porkbun listRecords',
    );
    return records
      .map(record => toDnsRecord(zoneId, record))
      .filter((record): record is DnsRecord => Boolean(record));
  },

  async upsertRecord(zoneId, record, config) {
    const ttl = record.ttl ?? config.defaultTtl ?? 600;
    const existing = (await this.listRecords(zoneId, config)).find(
      current => nameMatches(zoneId, current.name, record.name) && current.type === record.type,
    );

    if (existing) {
      await porkbunRequest(
        `/dns/edit/${encodeURIComponent(zoneId)}/${encodeURIComponent(existing.id)}`,
        recordBody(zoneId, record, ttl),
        'Porkbun upsertRecord (edit)',
      );
      return { ...record, id: existing.id, zone: zoneId, ttl };
    }

    const created = await porkbunRequest(
      `/dns/create/${encodeURIComponent(zoneId)}`,
      recordBody(zoneId, record, ttl),
      'Porkbun upsertRecord (create)',
    );
    return { ...record, id: String(created.id), zone: zoneId, ttl };
  },

  async deleteRecord(zoneId, recordId) {
    await porkbunRequest(
      `/dns/delete/${encodeURIComponent(zoneId)}/${encodeURIComponent(recordId)}`,
      {},
      'Porkbun deleteRecord',
    );
  },

  async syncRoundRobin({ zoneId, name, ips, ttl }, config) {
    const ttlFinal = ttl ?? config.defaultTtl ?? 600;
    const desiredIps = [...new Set(ips)];
    const existing = (await this.listRecords(zoneId, config)).filter(
      record => record.type === 'A' && nameMatches(zoneId, record.name, name),
    );
    const resultByIp = new Map<string, DnsRecord>();
    const keepByIp = new Map<string, DnsRecord>();

    for (const record of existing) {
      if (desiredIps.includes(record.value) && !keepByIp.has(record.value)) {
        keepByIp.set(record.value, record);
        continue;
      }
      await this.deleteRecord(zoneId, record.id, config);
    }

    for (const ip of desiredIps) {
      const kept = keepByIp.get(ip);
      if (!kept) {
        const record = {
          zone: zoneId,
          name,
          type: 'A',
          value: ip,
          ttl: ttlFinal,
        } satisfies Omit<DnsRecord, 'id'>;
        const created = await porkbunRequest(
          `/dns/create/${encodeURIComponent(zoneId)}`,
          recordBody(zoneId, record, ttlFinal),
          'Porkbun syncRoundRobin (create)',
        );
        resultByIp.set(ip, { ...record, id: String(created.id) });
        continue;
      }

      if (kept.ttl !== ttlFinal) {
        await porkbunRequest(
          `/dns/edit/${encodeURIComponent(zoneId)}/${encodeURIComponent(kept.id)}`,
          recordBody(zoneId, {
            zone: zoneId,
            name,
            type: 'A',
            value: ip,
            ttl: ttlFinal,
          }, ttlFinal),
          'Porkbun syncRoundRobin (edit)',
        );
        resultByIp.set(ip, { ...kept, name, ttl: ttlFinal });
      } else {
        resultByIp.set(ip, kept);
      }
    }

    return desiredIps.map(ip => resultByIp.get(ip)!);
  },

  setup: tokenSetup<Config>({
    secretKey: 'PORKBUN_API_KEY',
    label: 'Porkbun DNS',
    vendorDocUrl: 'https://porkbun.com/account/api',
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
