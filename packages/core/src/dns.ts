// DNS management — used by `sh1pt scale` to round-robin across the
// fleet as instances come up, and drop records as they're destroyed.

export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX';

export interface DnsRecord {
  id: string;                    // provider-native record id
  zone: string;                  // e.g. 'example.com'
  name: string;                  // subdomain, FQDN, or '@' for apex
  type: DnsRecordType;
  value: string;
  ttl: number;                   // seconds
  proxied?: boolean;             // Cloudflare-specific (orange cloud)
}

export interface DnsProvider<Config = unknown> {
  id: string;                    // e.g. 'dns-cloudflare'
  label: string;
  connect(ctx: { secret(k: string): string | undefined; log(m: string): void }, config: Config): Promise<{ accountId: string }>;
  listZones(config: Config): Promise<{ id: string; name: string }[]>;
  listRecords(zoneId: string, config: Config): Promise<DnsRecord[]>;
  upsertRecord(zoneId: string, record: Omit<DnsRecord, 'id'>, config: Config): Promise<DnsRecord>;
  deleteRecord(zoneId: string, recordId: string, config: Config): Promise<void>;
  // Sync N IPs as round-robin A records at <name>.<zone>. sh1pt uses this
  // whenever `scale up/down` changes the fleet size.
  syncRoundRobin(opts: { zoneId: string; name: string; ips: string[]; ttl?: number; proxied?: boolean }, config: Config): Promise<DnsRecord[]>;
}

export function defineDns<Config>(p: DnsProvider<Config>): DnsProvider<Config> {
  return p;
}

const dnsRegistry = new Map<string, DnsProvider<any>>();

export function registerDnsProvider(p: DnsProvider<any>): void {
  if (dnsRegistry.has(p.id)) throw new Error(`DNS provider already registered: ${p.id}`);
  dnsRegistry.set(p.id, p);
}

export function getDnsProvider(id: string): DnsProvider<any> | undefined {
  return dnsRegistry.get(id);
}

export function listDnsProviders(): DnsProvider<any>[] {
  return [...dnsRegistry.values()];
}
