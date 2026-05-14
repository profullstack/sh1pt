import { createHash, createHmac } from 'node:crypto';
import { defineDns, type DnsRecord } from '@profullstack/sh1pt-core';

// AWS Route 53 DNS. Auth: AWS IAM credentials (Access Key + Secret).
// Uses the Route 53 REST API directly so the provider stays dependency-free.
//
// Key concepts:
//   - Hosted Zone ID (e.g. Z1234567890) identifies a domain
//   - ALIAS record: a Route 53 extension to the DNS standard that lets
//     the zone apex (bare domain) point to AWS resources or other zones
//   - ChangeBatch: atomic batch of CREATE/DELETE/UPSERT actions
interface Config {
  region?: string;  // e.g. 'us-east-1' (Route 53 is global but SDK needs a region)
  defaultTtl?: number;
}

const API = 'https://route53.amazonaws.com';
const API_VERSION = '2013-04-01';
let _secret: (k: string) => string | undefined = () => undefined;

interface HostedZone {
  id: string;
  name: string;
}

interface RecordId {
  name: string;
  type: DnsRecord['type'];
  value: string;
}

interface ListRecordSetsResult {
  records: DnsRecord[];
  isTruncated: boolean;
  nextRecordName?: string;
  nextRecordType?: string;
  nextRecordIdentifier?: string;
}

function awsRegion(config: Config): string {
  return config.region ?? 'us-east-1';
}

function requiredSecret(key: string): string {
  const value = _secret(key);
  if (!value) throw new Error(`${key} not set`);
  return value;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function hmacHex(key: Buffer, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, char =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalQuery(params: URLSearchParams): string {
  return [...params.entries()]
    .sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&');
}

function amzDates(now = new Date()): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function signRequest(method: string, path: string, params: URLSearchParams, body: string, config: Config): Record<string, string> {
  const accessKey = requiredSecret('AWS_ACCESS_KEY_ID');
  const secretKey = requiredSecret('AWS_SECRET_ACCESS_KEY');
  const sessionToken = _secret('AWS_SESSION_TOKEN');
  const { amzDate, dateStamp } = amzDates();
  const region = awsRegion(config);
  const payloadHash = sha256Hex(body);
  const signingHeaders: Record<string, string> = {
    host: 'route53.amazonaws.com',
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };

  if (sessionToken) signingHeaders['x-amz-security-token'] = sessionToken;
  if (method !== 'GET') signingHeaders['content-type'] = 'application/xml';

  const signedHeaderNames = Object.keys(signingHeaders).sort();
  const canonicalHeaders = signedHeaderNames.map(name => `${name}:${signingHeaders[name]}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalRequest = [
    method,
    path,
    canonicalQuery(params),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${region}/route53/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), region), 'route53'), 'aws4_request');
  const signature = hmacHex(signingKey, stringToSign);
  const requestHeaders = { ...signingHeaders };
  delete requestHeaders.host;
  requestHeaders.authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return requestHeaders;
}

function normalizeZoneId(zoneId: string): string {
  return zoneId.replace(/^\/hostedzone\//, '').replace(/^\//, '');
}

function stripTrailingDot(value: string): string {
  return value.endsWith('.') ? value.slice(0, -1) : value;
}

function awsRecordName(name: string): string {
  return name.endsWith('.') ? name : `${name}.`;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlDecode(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function tagBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    blocks.push(match[1] ?? '');
  }
  return blocks;
}

function tagValue(xml: string, tag: string): string | undefined {
  const block = tagBlocks(xml, tag)[0];
  return block === undefined ? undefined : xmlDecode(block.trim());
}

function supportedType(type: string): type is DnsRecord['type'] {
  return type === 'A' || type === 'AAAA' || type === 'CNAME' || type === 'TXT' || type === 'MX';
}

function encodeRecordId(record: RecordId): string {
  return encodeURIComponent(JSON.stringify(record));
}

function decodeRecordId(id: string): RecordId | undefined {
  try {
    const parsed = JSON.parse(decodeURIComponent(id)) as Partial<RecordId>;
    if (typeof parsed.name === 'string' && typeof parsed.type === 'string' && supportedType(parsed.type) && typeof parsed.value === 'string') {
      return { name: parsed.name, type: parsed.type, value: parsed.value };
    }
  } catch {
    // fall through to undefined
  }
  return undefined;
}

function recordNameMatches(actual: string, requested: string): boolean {
  const normalizedActual = stripTrailingDot(actual);
  const normalizedRequested = stripTrailingDot(requested);
  if (normalizedActual === normalizedRequested) return true;
  return !normalizedRequested.includes('.') && normalizedActual.startsWith(`${normalizedRequested}.`);
}

function toDnsRecord(zoneId: string, name: string, type: DnsRecord['type'], value: string, ttl: number): DnsRecord {
  return {
    id: encodeRecordId({ name, type, value }),
    zone: zoneId,
    name,
    type,
    value,
    ttl,
  };
}

function parseHostedZones(xml: string): { zones: HostedZone[]; isTruncated: boolean; nextMarker?: string } {
  return {
    zones: tagBlocks(xml, 'HostedZone').map(zoneXml => ({
      id: normalizeZoneId(tagValue(zoneXml, 'Id') ?? ''),
      name: stripTrailingDot(tagValue(zoneXml, 'Name') ?? ''),
    })).filter(zone => zone.id && zone.name),
    isTruncated: tagValue(xml, 'IsTruncated') === 'true',
    nextMarker: tagValue(xml, 'NextMarker'),
  };
}

function parseRecordSets(zoneId: string, xml: string): ListRecordSetsResult {
  const records: DnsRecord[] = [];

  for (const recordSetXml of tagBlocks(xml, 'ResourceRecordSet')) {
    const name = stripTrailingDot(tagValue(recordSetXml, 'Name') ?? '');
    const rawType = tagValue(recordSetXml, 'Type') ?? '';
    if (!name) continue;

    const aliasTarget = tagBlocks(recordSetXml, 'AliasTarget')[0];
    if (aliasTarget) {
      const value = stripTrailingDot(tagValue(aliasTarget, 'DNSName') ?? '');
      if (value) records.push(toDnsRecord(zoneId, name, 'CNAME', value, 0));
      continue;
    }

    if (!supportedType(rawType)) continue;
    const ttl = Number(tagValue(recordSetXml, 'TTL') ?? 300);
    for (const rr of tagBlocks(recordSetXml, 'ResourceRecord')) {
      const value = tagValue(rr, 'Value');
      if (value) records.push(toDnsRecord(zoneId, name, rawType, value, ttl));
    }
  }

  return {
    records,
    isTruncated: tagValue(xml, 'IsTruncated') === 'true',
    nextRecordName: tagValue(xml, 'NextRecordName'),
    nextRecordType: tagValue(xml, 'NextRecordType'),
    nextRecordIdentifier: tagValue(xml, 'NextRecordIdentifier'),
  };
}

async function route53Request(operation: string, method: string, path: string, params: URLSearchParams, body: string, config: Config): Promise<string> {
  const query = canonicalQuery(params);
  const headers = signRequest(method, path, params, body, config);
  const res = await fetch(`${API}${path}${query ? `?${query}` : ''}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Route53 ${operation}: ${res.status}${text ? ` ${text.slice(0, 200)}` : ''}`);
  return text;
}

function recordSetXml(name: string, type: DnsRecord['type'], ttl: number, values: string[]): string {
  return [
    '<ResourceRecordSet>',
    `<Name>${xmlEscape(awsRecordName(name))}</Name>`,
    `<Type>${type}</Type>`,
    `<TTL>${ttl}</TTL>`,
    '<ResourceRecords>',
    ...values.map(value => `<ResourceRecord><Value>${xmlEscape(value)}</Value></ResourceRecord>`),
    '</ResourceRecords>',
    '</ResourceRecordSet>',
  ].join('');
}

async function changeRecordSet(
  zoneId: string,
  action: 'DELETE' | 'UPSERT',
  name: string,
  type: DnsRecord['type'],
  ttl: number,
  values: string[],
  config: Config,
): Promise<void> {
  const body = [
    `<ChangeResourceRecordSetsRequest xmlns="https://route53.amazonaws.com/doc/${API_VERSION}/">`,
    '<ChangeBatch><Changes><Change>',
    `<Action>${action}</Action>`,
    recordSetXml(name, type, ttl, values),
    '</Change></Changes></ChangeBatch>',
    '</ChangeResourceRecordSetsRequest>',
  ].join('');
  await route53Request(
    'changeRecordSet',
    'POST',
    `/${API_VERSION}/hostedzone/${encodeRfc3986(normalizeZoneId(zoneId))}/rrset`,
    new URLSearchParams(),
    body,
    config,
  );
}

export default defineDns<Config>({
  id: 'dns-route53',
  label: 'AWS Route 53',

  async connect(ctx) {
    _secret = (k) => ctx.secret(k);
    if (!ctx.secret('AWS_ACCESS_KEY_ID') || !ctx.secret('AWS_SECRET_ACCESS_KEY')) {
      throw new Error('AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY not set — run `sh1pt secret set AWS_ACCESS_KEY_ID ...` (required)');
    }
    return { accountId: 'route53' };
  },

  async listZones(config) {
    const zones: HostedZone[] = [];
    let marker: string | undefined;
    let truncated = false;

    do {
      const params = new URLSearchParams({ maxitems: '100' });
      if (marker) params.set('marker', marker);
      const xml = await route53Request('listZones', 'GET', `/${API_VERSION}/hostedzone`, params, '', config);
      const page = parseHostedZones(xml);
      zones.push(...page.zones);
      truncated = page.isTruncated;
      marker = page.nextMarker;
    } while (truncated && marker);

    return zones;
  },

  async listRecords(zoneId, config) {
    const records: DnsRecord[] = [];
    let nextName: string | undefined;
    let nextType: string | undefined;
    let nextIdentifier: string | undefined;
    let truncated = false;

    do {
      const params = new URLSearchParams({ maxitems: '100' });
      if (nextName) params.set('name', nextName);
      if (nextType) params.set('type', nextType);
      if (nextIdentifier) params.set('identifier', nextIdentifier);
      const xml = await route53Request(
        'listRecords',
        'GET',
        `/${API_VERSION}/hostedzone/${encodeRfc3986(normalizeZoneId(zoneId))}/rrset`,
        params,
        '',
        config,
      );
      const page = parseRecordSets(zoneId, xml);
      records.push(...page.records);
      truncated = page.isTruncated;
      nextName = page.nextRecordName;
      nextType = page.nextRecordType;
      nextIdentifier = page.nextRecordIdentifier;
    } while (truncated && nextName && nextType);

    return records;
  },

  async upsertRecord(zoneId, record, config) {
    const ttl = record.ttl ?? config.defaultTtl ?? 300;
    const existing = (await this.listRecords(zoneId, config)).filter(
      r => r.type === record.type && recordNameMatches(r.name, record.name),
    );
    const values = record.type === 'CNAME'
      ? [record.value]
      : [...new Set([...existing.map(r => r.value), record.value])];
    await changeRecordSet(zoneId, 'UPSERT', record.name, record.type, ttl, values, config);
    return { id: encodeRecordId({ name: record.name, type: record.type, value: record.value }), ...record, zone: zoneId, ttl };
  },

  async deleteRecord(zoneId, recordId, config) {
    const record = decodeRecordId(recordId);
    if (!record) return;
    const existing = (await this.listRecords(zoneId, config)).filter(
      r => r.type === record.type && recordNameMatches(r.name, record.name),
    );
    if (existing.length === 0) return;

    const remaining = existing.filter(r => r.value !== record.value);
    const ttl = existing[0]?.ttl ?? config.defaultTtl ?? 300;
    if (remaining.length === 0) {
      await changeRecordSet(zoneId, 'DELETE', record.name, record.type, ttl, existing.map(r => r.value), config);
      return;
    }
    await changeRecordSet(zoneId, 'UPSERT', record.name, record.type, ttl, remaining.map(r => r.value), config);
  },

  async syncRoundRobin({ zoneId, name, ips, ttl }, config) {
    const ttlFinal = ttl ?? config.defaultTtl ?? 300;
    const uniqueIps = [...new Set(ips)];
    if (uniqueIps.length === 0) {
      const existing = (await this.listRecords(zoneId, config)).filter(
        r => r.type === 'A' && recordNameMatches(r.name, name),
      );
      if (existing.length > 0) await changeRecordSet(zoneId, 'DELETE', name, 'A', existing[0]?.ttl ?? ttlFinal, existing.map(r => r.value), config);
      return [];
    }

    await changeRecordSet(zoneId, 'UPSERT', name, 'A', ttlFinal, uniqueIps, config);
    return uniqueIps.map(ip => toDnsRecord(zoneId, name, 'A', ip, ttlFinal));
  },
});
