import { defineDns, type DnsRecord } from '@sh1pt/core';

// Namecheap DNS API (XML-based). Auth: API key + username.
// Base: https://api.namecheap.com/xml.response
// Required params on every call: ApiUser, ApiKey, UserName, ClientIp, Command
// Key commands:
//   namecheap.domains.dns.getHosts    — list all host records for a domain
//   namecheap.domains.dns.setHosts    — replace ALL host records for a domain (full replace!)
// IMPORTANT: setHosts replaces the FULL record set for the SLD+TLD.
// Read → modify → write back is the required pattern.
// Namecheap does not support ALIAS at the zone apex; use URL redirect for apex.
interface Config {
  defaultTtl?: number;
  clientIp?: string;
}

const API = 'https://api.namecheap.com/xml.response';
let _secret: (k: string) => string | undefined = () => undefined;

function apiParams(command: string, extra: Record<string, string> = {}, config: Config = {}) {
  const params = new URLSearchParams({
    ApiUser: _secret('NAMECHEAP_USERNAME') ?? '',
    ApiKey: _secret('NAMECHEAP_API_KEY') ?? '',
    UserName: _secret('NAMECHEAP_USERNAME') ?? '',
    ClientIp: config.clientIp ?? _secret('NAMECHEAP_CLIENT_IP') ?? '127.0.0.1',
    Command: command,
    ...extra,
  });
  return params.toString();
}

async function parseXml(text: string): Promise<{ status: string; records?: { id: string; name: string; type: string; address: string; ttl: string }[] }> {
  // Minimal XML parsing without a library — good enough for Namecheap's predictable schema.
  const ok = text.includes('Status="OK"');
  const records: { id: string; name: string; type: string; address: string; ttl: string }[] = [];
  const hostRe = /<host\s([^/]*?)\/>/gi;
  let m: RegExpExecArray | null;
  while ((m = hostRe.exec(text)) !== null) {
    const attr = (name: string) => {
      const a = new RegExp(`${name}="([^"]*)"`, 'i').exec(m![1]);
      return a ? a[1] : '';
    };
    records.push({
      id: attr('HostId'),
      name: attr('Name'),
      type: attr('Type'),
      address: attr('Address'),
      ttl: attr('TTL'),
    });
  }
  return { status: ok ? 'OK' : 'ERR', records };
}

async function setHosts(zoneId: string, records: DnsRecord[], config: Config) {
  const [sld, ...tldParts] = zoneId.split('.');
  const tld = tldParts.join('.');
  const extra: Record<string, string> = { SLD: sld, TLD: tld };
  records.forEach((r, i) => {
    const n = i + 1;
    const name = r.name === zoneId ? '@' : r.name.endsWith(`.${zoneId}`) ? r.name.slice(0, -(zoneId.length + 1)) : r.name;
    extra[`HostName${n}`] = name;
    extra[`RecordType${n}`] = r.type;
    extra[`Address${n}`] = r.value;
    extra[`TTL${n}`] = String(r.ttl ?? 1800);
  });
  const res = await fetch(`${API}?${apiParams('namecheap.domains.dns.setHosts', extra, config)}`);
  if (!res.ok) throw new Error(`Namecheap setHosts HTTP ${res.status}`);
  const text = await res.text();
  if (!text.includes('Status="OK"')) throw new Error(`Namecheap setHosts: API error — ${text.slice(0, 200)}`);
}

export default defineDns<Config>({
  id: 'dns-namecheap',
  label: 'Namecheap DNS',

  async connect(ctx) {
    _secret = (k) => ctx.secret(k);
    if (!ctx.secret('NAMECHEAP_API_KEY') || !ctx.secret('NAMECHEAP_USERNAME')) {
      throw new Error('NAMECHEAP_API_KEY / NAMECHEAP_USERNAME not set');
    }
    return { accountId: 'namecheap' };
  },

  async listZones() {
    // Namecheap has no "list all domains" endpoint in the free API tier.
    // Domains are managed individually. sh1pt treats declared domains as zones.
    return [];
  },

  async listRecords(zoneId, config) {
    const [sld, ...tldParts] = zoneId.split('.');
    const tld = tldParts.join('.');
    const res = await fetch(`${API}?${apiParams('namecheap.domains.dns.getHosts', { SLD: sld, TLD: tld }, config)}`);
    if (!res.ok) throw new Error(`Namecheap listRecords HTTP ${res.status}`);
    const text = await res.text();
    const { status, records } = await parseXml(text);
    if (status !== 'OK') throw new Error(`Namecheap listRecords: API error — ${text.slice(0, 200)}`);
    return (records ?? []).map(r => ({
      id: r.id,
      zone: zoneId,
      name: r.name === '@' ? zoneId : `${r.name}.${zoneId}`,
      type: r.type as DnsRecord['type'],
      value: r.address,
      ttl: Number(r.ttl),
    }));
  },

  async upsertRecord(zoneId, record, config) {
    // Namecheap setHosts replaces all records — read first, then write back.
    const existing = await this.listRecords(zoneId, config);
    const idx = existing.findIndex(r => r.name === record.name && r.type === record.type);
    const ttl = record.ttl ?? config.defaultTtl ?? 1800;
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], value: record.value, ttl };
    } else {
      existing.push({ id: '', zone: zoneId, ...record, ttl });
    }
    await setHosts(zoneId, existing, config);
    return { ...record, id: record.name, zone: zoneId };
  },

  async deleteRecord(zoneId, recordId, config) {
    const existing = await this.listRecords(zoneId, config);
    const filtered = existing.filter(r => r.id !== recordId && r.name !== recordId);
    await setHosts(zoneId, filtered, config);
  },

  async syncRoundRobin({ zoneId, name, ips, ttl }, config) {
    const ttlFinal = ttl ?? config.defaultTtl ?? 1800;
    const existing = await this.listRecords(zoneId, config);
    const others = existing.filter(r => !(r.name === name && r.type === 'A'));
    const newARecords: DnsRecord[] = ips.map((ip, i) => ({
      id: `nc-rr-${i}`,
      zone: zoneId,
      name,
      type: 'A' as const,
      value: ip,
      ttl: ttlFinal,
    }));
    await setHosts(zoneId, [...others, ...newARecords], config);
    return newARecords;
  },
});
