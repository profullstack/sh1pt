import { defineDns, type DnsRecord } from '@profullstack/sh1pt-core';

// Namecheap DNS API. Auth is API key + username + whitelisted client IP.
// Core DNS commands:
//   namecheap.domains.dns.getHosts - list all host records for a domain
//   namecheap.domains.dns.setHosts - replace all host records for a domain
// setHosts is a full-zone replacement, so every mutation must read first and
// send unrelated records back alongside the changed records.
interface Config {
  baseUrl?: string;
  defaultTtl?: number;
  clientIp?: string;
}

const DEFAULT_API = 'https://api.namecheap.com/xml.response';
let _secret: (key: string) => string | undefined = () => undefined;

type NamecheapRecord = DnsRecord & {
  mxPref?: string;
};

type ParsedHost = {
  id: string;
  name: string;
  type: string;
  address: string;
  ttl: string;
  mxPref?: string;
};

function apiUrl(config: Config): string {
  return config.baseUrl ?? DEFAULT_API;
}

function apiCredentials() {
  const username = _secret('NAMECHEAP_USERNAME');
  const apiKey = _secret('NAMECHEAP_API_KEY');
  if (!username || !apiKey) {
    throw new Error('NAMECHEAP_API_KEY / NAMECHEAP_USERNAME not in vault - run `sh1pt secret set NAMECHEAP_API_KEY ...`');
  }
  return { username, apiKey };
}

function hasCredentials(): boolean {
  return !!_secret('NAMECHEAP_USERNAME') && !!_secret('NAMECHEAP_API_KEY');
}

function domainParts(zoneId: string): { sld: string; tld: string } {
  const [sld, ...tldParts] = zoneId.split('.');
  if (!sld || tldParts.length === 0) {
    throw new Error(`Namecheap zone must be a domain name, got ${zoneId}`);
  }
  return { sld, tld: tldParts.join('.') };
}

function ttlValue(ttl: number | undefined, config: Config): number {
  return ttl ?? config.defaultTtl ?? 1800;
}

function normalizeRecordName(zoneId: string, name: string): string {
  const trimmed = name.replace(/\.$/, '');
  if (!trimmed || trimmed === '@') return zoneId;
  if (trimmed === zoneId || trimmed.endsWith(`.${zoneId}`)) return trimmed;
  return `${trimmed}.${zoneId}`;
}

function toNamecheapHost(zoneId: string, name: string): string {
  const normalized = normalizeRecordName(zoneId, name);
  if (normalized === zoneId) return '@';
  return normalized.slice(0, -(zoneId.length + 1));
}

function decodeXmlAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseAttributes(input: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([\w:-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(input)) !== null) {
    const [, key, value] = match;
    if (key !== undefined && value !== undefined) {
      attrs[key] = decodeXmlAttr(value);
    }
  }
  return attrs;
}

function parseXml(text: string): { ok: boolean; hosts: ParsedHost[]; error?: string } {
  const ok = /<ApiResponse\b[^>]*Status="OK"/i.test(text);
  const error = /<Error\b[^>]*>([^<]*)<\/Error>/i.exec(text)?.[1];
  const hosts: ParsedHost[] = [];
  const hostRe = /<Host\b([^>]*)\/>/gi;
  let match: RegExpExecArray | null;
  while ((match = hostRe.exec(text)) !== null) {
    const attrs = parseAttributes(match[1] ?? '');
    hosts.push({
      id: attrs.HostId ?? attrs.HostID ?? '',
      name: attrs.Name ?? '',
      type: attrs.Type ?? '',
      address: attrs.Address ?? '',
      ttl: attrs.TTL ?? '',
      mxPref: attrs.MXPref,
    });
  }
  return { ok, hosts, error: error ? decodeXmlAttr(error) : undefined };
}

function mapHost(zoneId: string, host: ParsedHost, config: Config): NamecheapRecord {
  const ttl = Number(host.ttl);
  return {
    id: host.id,
    zone: zoneId,
    name: normalizeRecordName(zoneId, host.name),
    type: host.type as DnsRecord['type'],
    value: host.address,
    ttl: Number.isFinite(ttl) && ttl > 0 ? ttl : ttlValue(undefined, config),
    mxPref: host.mxPref,
  };
}

function apiParams(command: string, extra: Record<string, string> = {}, config: Config = {}) {
  const { username, apiKey } = apiCredentials();
  return new URLSearchParams({
    ApiUser: username,
    ApiKey: apiKey,
    UserName: username,
    ClientIp: config.clientIp ?? _secret('NAMECHEAP_CLIENT_IP') ?? '127.0.0.1',
    Command: command,
    ...extra,
  }).toString();
}

async function namecheapGet(command: string, extra: Record<string, string>, config: Config): Promise<string> {
  const res = await fetch(`${apiUrl(config)}?${apiParams(command, extra, config)}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`Namecheap ${command} HTTP ${res.status}: ${text.slice(0, 200)}`);
  const parsed = parseXml(text);
  if (!parsed.ok) {
    throw new Error(`Namecheap ${command}: ${parsed.error ?? text.slice(0, 200)}`);
  }
  return text;
}

async function fetchRecords(zoneId: string, config: Config): Promise<NamecheapRecord[]> {
  const { sld, tld } = domainParts(zoneId);
  const text = await namecheapGet('namecheap.domains.dns.getHosts', { SLD: sld, TLD: tld }, config);
  return parseXml(text).hosts.map((host) => mapHost(zoneId, host, config));
}

async function setHosts(zoneId: string, records: NamecheapRecord[], config: Config) {
  const { sld, tld } = domainParts(zoneId);
  const extra: Record<string, string> = { SLD: sld, TLD: tld };
  records.forEach((record, index) => {
    const hostNumber = index + 1;
    extra[`HostName${hostNumber}`] = toNamecheapHost(zoneId, record.name);
    extra[`RecordType${hostNumber}`] = record.type;
    extra[`Address${hostNumber}`] = record.value;
    extra[`TTL${hostNumber}`] = String(record.ttl ?? ttlValue(undefined, config));
    if (record.mxPref !== undefined) extra[`MXPref${hostNumber}`] = record.mxPref;
  });
  await namecheapGet('namecheap.domains.dns.setHosts', extra, config);
}

export default defineDns<Config>({
  id: 'dns-namecheap',
  label: 'Namecheap DNS',

  async connect(ctx) {
    _secret = (key) => ctx.secret(key);
    if (!ctx.secret('NAMECHEAP_API_KEY') || !ctx.secret('NAMECHEAP_USERNAME')) {
      throw new Error('NAMECHEAP_API_KEY / NAMECHEAP_USERNAME not in vault - run `sh1pt secret set NAMECHEAP_API_KEY ...`');
    }
    ctx.log('namecheap dns connected');
    return { accountId: 'namecheap' };
  },

  async listZones() {
    // Domains are managed individually by this adapter's config/CLI caller.
    return [];
  },

  async listRecords(zoneId, config) {
    return fetchRecords(zoneId, config);
  },

  async upsertRecord(zoneId, record, config) {
    const existing = await fetchRecords(zoneId, config);
    const ttl = ttlValue(record.ttl, config);
    const normalizedName = normalizeRecordName(zoneId, record.name);
    const index = existing.findIndex((candidate) => (
      candidate.type === record.type
      && normalizeRecordName(zoneId, candidate.name) === normalizedName
    ));
    const match = index >= 0 ? existing[index] : undefined;
    const nextRecord: NamecheapRecord = {
      ...record,
      id: match?.id ?? normalizedName,
      zone: zoneId,
      name: normalizedName,
      ttl,
    };

    if (match) {
      existing[index] = { ...match, ...nextRecord };
    } else {
      existing.push(nextRecord);
    }

    await setHosts(zoneId, existing, config);
    return nextRecord;
  },

  async deleteRecord(zoneId, recordId, config) {
    const existing = await fetchRecords(zoneId, config);
    const filtered = existing.filter((record) => (
      record.id !== recordId && normalizeRecordName(zoneId, record.name) !== normalizeRecordName(zoneId, recordId)
    ));
    await setHosts(zoneId, filtered, config);
  },

  async syncRoundRobin({ zoneId, name, ips, ttl }, config) {
    const ttlFinal = ttlValue(ttl, config);
    const normalizedName = normalizeRecordName(zoneId, name);
    const desiredIps = [...new Set(ips)];

    if (!hasCredentials()) {
      return desiredIps.map((ip, index) => ({
        id: `nc-rr-${index}`,
        zone: zoneId,
        name: normalizedName,
        type: 'A' as const,
        value: ip,
        ttl: ttlFinal,
      })) satisfies DnsRecord[];
    }

    const desired = new Set(desiredIps);
    const existing = await fetchRecords(zoneId, config);
    const kept = new Map<string, NamecheapRecord>();
    const preserved: NamecheapRecord[] = [];

    for (const record of existing) {
      const isTarget = record.type === 'A' && normalizeRecordName(zoneId, record.name) === normalizedName;
      if (!isTarget) {
        preserved.push(record);
        continue;
      }
      if (desired.has(record.value) && !kept.has(record.value)) {
        kept.set(record.value, {
          ...record,
          zone: zoneId,
          name: normalizedName,
          ttl: ttlFinal,
        });
      }
    }

    for (const ip of desiredIps) {
      if (!kept.has(ip)) {
        kept.set(ip, {
          id: `${normalizedName}:${ip}`,
          zone: zoneId,
          name: normalizedName,
          type: 'A',
          value: ip,
          ttl: ttlFinal,
        });
      }
    }

    const synced = desiredIps.map((ip) => kept.get(ip)).filter((record): record is NamecheapRecord => !!record);
    await setHosts(zoneId, [...preserved, ...synced], config);
    return synced;
  },
});
