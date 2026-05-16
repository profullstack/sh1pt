import { Command } from 'commander';
import kleur from 'kleur';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CREDS_FILE = join(homedir(), '.sh1pt', 'credentials.json');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FleetEntry {
  id: string;
  provider: string;
  status: 'running' | 'stopped' | 'failed';
  publicIp?: string;
  privateIp?: string;
  createdAt: string;
  hourlyRate: number;
  tags?: string[];
}

interface DnsRecord {
  id: string;
  hostname: string;
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT';
  value: string;
  ttl: number;
  proxied?: boolean;
  provider: string;
}

interface DnsConfig {
  records: DnsRecord[];
  zoneId?: string;
}

interface ProviderCredentials {
  apiKey?: string;
  apiToken?: string;
  email?: string;
  zoneId?: string;
}

interface DnsProviders {
  cloudflare?: ProviderCredentials;
  vercel?: ProviderCredentials;
  namecheap?: ProviderCredentials;
}

// ---------------------------------------------------------------------------
// DNS Provider abstraction
// ---------------------------------------------------------------------------

interface DnsProvider {
  name: string;
  listRecords: () => Promise<DnsRecord[]>;
  setRecord: (hostname: string, ip: string, ttl: number, proxied: boolean, dryRun: boolean) => Promise<DnsRecord>;
  removeRecord: (hostname: string, dryRun: boolean) => Promise<boolean>;
}

class CloudflareProvider implements DnsProvider {
  name = 'cloudflare';
  private apiToken: string;
  private zoneId: string;
  private baseUrl = 'https://api.cloudflare.com/client/v4';

  constructor(creds: ProviderCredentials, zoneId: string) {
    this.apiToken = creds.apiToken ?? creds.apiKey ?? '';
    this.zoneId = zoneId;
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    if (!this.apiToken) throw new Error('Cloudflare API token not configured. Set cloudflare.apiToken in ~/.sh1pt/credentials.json');

    const url = `${this.baseUrl}/zones/${this.zoneId}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await response.json()) as { success: boolean; result: unknown; errors: Array<{ message: string }> };
    if (!data.success) {
      const msg = data.errors?.map((e) => e.message).join(', ') ?? 'unknown error';
      throw new Error(`Cloudflare API error: ${msg}`);
    }
    return data.result;
  }

  async listRecords(): Promise<DnsRecord[]> {
    const result = (await this.request('GET', '/dns_records')) as Array<{
      id: string;
      name: string;
      type: string;
      content: string;
      ttl: number;
      proxied: boolean;
    }>;
    return result.map((r) => ({
      id: r.id,
      hostname: r.name,
      type: r.type as DnsRecord['type'],
      value: r.content,
      ttl: r.ttl,
      proxied: r.proxied,
      provider: 'cloudflare',
    }));
  }

  async setRecord(hostname: string, ip: string, ttl: number, proxied: boolean, dryRun: boolean): Promise<DnsRecord> {
    if (dryRun) {
      console.log(kleur.dim(`[dry-run] Cloudflare: would create A record ${hostname} → ${ip} (TTL: ${ttl}, proxied: ${proxied})`));
      return { id: '(dry-run)', hostname, type: 'A', value: ip, ttl, proxied, provider: 'cloudflare' };
    }

    const body = {
      type: 'A',
      name: hostname,
      content: ip,
      ttl,
      proxied,
    };
    const result = (await this.request('POST', '/dns_records', body)) as {
      id: string;
      name: string;
      type: string;
      content: string;
      ttl: number;
      proxied: boolean;
    };
    return {
      id: result.id,
      hostname: result.name,
      type: result.type as DnsRecord['type'],
      value: result.content,
      ttl: result.ttl,
      proxied: result.proxied,
      provider: 'cloudflare',
    };
  }

  async removeRecord(hostname: string, dryRun: boolean): Promise<boolean> {
    const records = await this.listRecords();
    const target = records.find((r) => r.hostname === hostname || r.hostname === `${hostname}.`);
    if (!target) {
      console.log(kleur.yellow(`No DNS record found for "${hostname}" on Cloudflare.`));
      return false;
    }

    if (dryRun) {
      console.log(kleur.dim(`[dry-run] Cloudflare: would delete record ${target.id} (${target.hostname} → ${target.value})`));
      return true;
    }

    await this.request('DELETE', `/dns_records/${target.id}`);
    console.log(kleur.green(`Deleted Cloudflare DNS record: ${target.hostname} → ${target.value}`));
    return true;
  }
}

class VercelProvider implements DnsProvider {
  name = 'vercel';
  private apiToken: string;
  private teamId?: string;

  constructor(creds: ProviderCredentials) {
    this.apiToken = creds.apiToken ?? creds.apiKey ?? '';
    this.teamId = creds.zoneId;
  }

  private baseUrl = 'https://api.vercel.com';

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    if (!this.apiToken) throw new Error('Vercel API token not configured. Set vercel.apiToken in ~/.sh1pt/credentials.json');

    const url = `${this.baseUrl}${path}${this.teamId ? `?teamId=${this.teamId}` : ''}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Vercel API error (${response.status}): ${text}`);
    }
    return response.json() as Promise<unknown>;
  }

  async listRecords(): Promise<DnsRecord[]> {
    const result = (await this.request('GET', '/v4/domains')) as { domains: Array<{ name: string }> };
    const records: DnsRecord[] = [];
    for (const domain of result.domains ?? []) {
      const dnsResult = (await this.request('GET', `/v4/domains/${domain.name}/records`)) as {
        records: Array<{
          id: string;
          name: string;
          type: string;
          value: string;
          ttl: number;
        }>;
      };
      for (const r of dnsResult.records ?? []) {
        records.push({
          id: r.id,
          hostname: `${r.name}.${domain.name}`,
          type: r.type as DnsRecord['type'],
          value: r.value,
          ttl: r.ttl,
          provider: 'vercel',
        });
      }
    }
    return records;
  }

  async setRecord(hostname: string, ip: string, ttl: number, _proxied: boolean, dryRun: boolean): Promise<DnsRecord> {
    if (dryRun) {
      console.log(kleur.dim(`[dry-run] Vercel: would create A record ${hostname} → ${ip} (TTL: ${ttl})`));
      return { id: '(dry-run)', hostname, type: 'A', value: ip, ttl, provider: 'vercel' };
    }

    const parts = hostname.split('.');
    const subdomain = parts.slice(0, -2).join('.') || '@';
    const domainName = parts.slice(-2).join('.');

    const body = {
      type: 'A',
      name: subdomain,
      value: ip,
      ttl,
    };
    const result = (await this.request('POST', `/v4/domains/${domainName}/records`, body)) as {
      uid: string;
      name: string;
      type: string;
      value: string;
      ttl: number;
    };
    return {
      id: result.uid,
      hostname: result.name,
      type: result.type as DnsRecord['type'],
      value: result.value,
      ttl: result.ttl,
      provider: 'vercel',
    };
  }

  async removeRecord(hostname: string, dryRun: boolean): Promise<boolean> {
    const records = await this.listRecords();
    const target = records.find((r) => r.hostname === hostname);
    if (!target) {
      console.log(kleur.yellow(`No DNS record found for "${hostname}" on Vercel.`));
      return false;
    }

    if (dryRun) {
      console.log(kleur.dim(`[dry-run] Vercel: would delete record ${target.id} (${target.hostname} → ${target.value})`));
      return true;
    }

    const parts = hostname.split('.');
    const domainName = parts.slice(-2).join('.');
    await this.request('DELETE', `/v4/domains/${domainName}/records/${target.id}`);
    console.log(kleur.green(`Deleted Vercel DNS record: ${target.hostname} → ${target.value}`));
    return true;
  }
}

class NamecheapProvider implements DnsProvider {
  name = 'namecheap';
  private apiKey: string;
  private userName: string;

  constructor(creds: ProviderCredentials) {
    this.apiKey = creds.apiKey ?? '';
    this.userName = creds.email ?? '';
  }

  private baseUrl = 'https://api.namecheap.com/xml.response';

  private async command(cmd: string, params: Record<string, string>): Promise<string> {
    if (!this.apiKey) throw new Error('Namecheap API key not configured. Set namecheap.apiKey in ~/.sh1pt/credentials.json');

    const query = new URLSearchParams({
      ApiUser: this.userName,
      ApiKey: this.apiKey,
      UserName: this.userName,
      Command: cmd,
      ClientIp: '0.0.0.0',
      ...params,
    });
    const response = await fetch(`${this.baseUrl}?${query}`);
    if (!response.ok) throw new Error(`Namecheap API error: ${response.status} ${response.statusText}`);
    return response.text();
  }

  async listRecords(): Promise<DnsRecord[]> {
    // Namecheap requires domain-level operations — we'll return empty for now
    // since we'd need to know the domain upfront. Use `set` with explicit domain.
    console.log(kleur.yellow('Namecheap list-records: specify --domain or use a subdomain to query.'));
    return [];
  }

  async setRecord(hostname: string, ip: string, ttl: number, _proxied: boolean, dryRun: boolean): Promise<DnsRecord> {
    if (dryRun) {
      console.log(kleur.dim(`[dry-run] Namecheap: would create A record ${hostname} → ${ip} (TTL: ${ttl})`));
      return { id: '(dry-run)', hostname, type: 'A', value: ip, ttl, provider: 'namecheap' };
    }

    const parts = hostname.split('.');
    const sld = parts[parts.length - 2]!;
    const tld = parts[parts.length - 1]!;
    const host = parts.slice(0, -2).join('.');

    const xml = await this.command('namecheap.domains.dns.setHosts', {
      SLD: sld,
      TLD: tld,
      HostName1: host || '@',
      RecordType1: 'A',
      Address1: ip,
      TTL1: String(ttl),
    });

    console.log(kleur.dim(`Namecheap response: ${xml.substring(0, 200)}...`));
    return { id: '(namecheap)', hostname, type: 'A', value: ip, ttl, provider: 'namecheap' };
  }

  async removeRecord(hostname: string, dryRun: boolean): Promise<boolean> {
    if (dryRun) {
      console.log(kleur.dim(`[dry-run] Namecheap: would remove DNS record for ${hostname}`));
      return true;
    }

    console.log(kleur.yellow(`Namecheap remove-record for "${hostname}": use Namecheap dashboard or set to a different IP.`));
    return false;
  }
}

// ---------------------------------------------------------------------------
// Credential helpers
// ---------------------------------------------------------------------------

function loadDnsProviders(): DnsProviders {
  try {
    if (existsSync(CREDS_FILE)) {
      const raw = JSON.parse(readFileSync(CREDS_FILE, 'utf-8')) as { dns?: DnsProviders };
      return raw.dns ?? {};
    }
  } catch {
    // corrupted or missing
  }
  return {};
}

function loadFleetIps(): string[] {
  try {
    if (existsSync(CREDS_FILE)) {
      const raw = JSON.parse(readFileSync(CREDS_FILE, 'utf-8')) as { instances?: Array<{ publicIp?: string }> };
      if (raw.instances) {
        return raw.instances.map((i) => i.publicIp).filter(Boolean) as string[];
      }
    }
  } catch {
    // corrupted or missing
  }
  return [];
}

function getProvider(providerName: string, providers: DnsProviders): DnsProvider {
  const creds: ProviderCredentials = {};

  switch (providerName) {
    case 'cloudflare': {
      const cf = providers.cloudflare;
      if (!cf) throw new Error('Cloudflare not configured. Add "dns.cloudflare" to ~/.sh1pt/credentials.json');
      const zoneId = cf.zoneId ?? '';
      if (!zoneId) throw new Error('Cloudflare zoneId required. Set dns.cloudflare.zoneId in ~/.sh1pt/credentials.json');
      return new CloudflareProvider(cf, zoneId);
    }
    case 'vercel': {
      const vc = providers.vercel;
      if (!vc) throw new Error('Vercel not configured. Add "dns.vercel" to ~/.sh1pt/credentials.json');
      return new VercelProvider(vc);
    }
    case 'namecheap': {
      const nc = providers.namecheap;
      if (!nc) throw new Error('Namecheap not configured. Add "dns.namecheap" to ~/.sh1pt/credentials.json');
      return new NamecheapProvider(nc);
    }
    default:
      throw new Error(`Unknown DNS provider "${providerName}". Supported: cloudflare, vercel, namecheap`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDnsTable(records: DnsRecord[]): string {
  if (records.length === 0) return kleur.dim('No DNS records found.');

  const rows = records.map((r) => ({
    id: r.id.length > 16 ? r.id.slice(0, 16) + '…' : r.id,
    hostname: r.hostname,
    type: r.type,
    value: r.value,
    ttl: String(r.ttl),
    proxied: r.proxied ? '✅' : '—',
    provider: r.provider,
  }));

  const widths = {
    id: Math.max(4, ...rows.map((r) => r.id.length)),
    hostname: Math.max(8, ...rows.map((r) => r.hostname.length)),
    type: Math.max(4, ...rows.map((r) => r.type.length)),
    value: Math.max(5, ...rows.map((r) => r.value.length)),
    ttl: Math.max(3, ...rows.map((r) => r.ttl.length)),
    proxied: 7,
    provider: Math.max(8, ...rows.map((r) => r.provider.length)),
  };

  const hr = kleur.dim('─'.repeat(Object.values(widths).reduce((a, b) => a + b + 3, 0)));

  const header =
    kleur.bold('ID'.padEnd(widths.id)) + ' ' +
    kleur.bold('Hostname'.padEnd(widths.hostname)) + ' ' +
    kleur.bold('Type'.padEnd(widths.type)) + ' ' +
    kleur.bold('Value'.padEnd(widths.value)) + ' ' +
    kleur.bold('TTL'.padEnd(widths.ttl)) + ' ' +
    kleur.bold('Proxied'.padEnd(widths.proxied)) + ' ' +
    kleur.bold('Provider'.padEnd(widths.provider));

  const lines = rows.map((r) =>
    r.id.padEnd(widths.id) + ' ' +
    r.hostname.padEnd(widths.hostname) + ' ' +
    r.type.padEnd(widths.type) + ' ' +
    r.value.padEnd(widths.value) + ' ' +
    r.ttl.padEnd(widths.ttl) + ' ' +
    r.proxied.padEnd(widths.proxied) + ' ' +
    r.provider.padEnd(widths.provider),
  );

  return `\n${header}\n${hr}\n${lines.join('\n')}\n`;
}

function formatJsonOutput(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// scale dns — command group
// ---------------------------------------------------------------------------

export const dnsCmd = new Command('dns')
  .description('Manage DNS records for deployed fleets. Supports Cloudflare, Vercel, and Namecheap providers.')
  .option('--json', 'output in JSON format for machine consumption')
  .option('--dry-run', 'show what would be done without making changes')
  .option('--provider <name>', 'DNS provider: cloudflare, vercel, namecheap (default: cloudflare)', 'cloudflare')
  .action(() => {
    dnsCmd.help();
  });

// dns list
dnsCmd
  .command('list')
  .description('Show current DNS records for the configured provider')
  .action(async (opts: { json?: boolean; dryRun?: boolean; provider: string }) => {
    const providers = loadDnsProviders();
    const provider = getProvider(opts.provider, providers);

    try {
      const records = await provider.listRecords();
      if (opts.json) {
        formatJsonOutput({ provider: opts.provider, records });
      } else {
        console.log(kleur.bold(`\n🌐 DNS Records — ${kleur.cyan(provider.name)}`));
        console.log(formatDnsTable(records));
      }
    } catch (err) {
      console.error(kleur.red(`Error listing DNS records: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// dns set <hostname>
dnsCmd
  .command('set')
  .description('Point a domain/subdomain to the fleet IP(s). If no --ip is given, uses the first fleet IP from state.')
  .argument('<hostname>', 'domain or subdomain to set, e.g. api.example.com')
  .option('--ip <address>', 'IP address to point the DNS record to (default: first fleet IP from ~/.sh1pt/credentials.json)')
  .option('--ttl <seconds>', 'DNS TTL in seconds', Number, 60)
  .option('--proxied', 'Cloudflare only — route through CF edge (orange cloud)')
  .action(async (hostname: string, opts: { json?: boolean; dryRun?: boolean; provider: string; ip?: string; ttl: number; proxied?: boolean }) => {
    const providers = loadDnsProviders();
    const provider = getProvider(opts.provider, providers);

    // Resolve IP
    let ip: string;
    if (opts.ip) {
      ip = opts.ip;
    } else {
      const fleetIps = loadFleetIps();
      if (fleetIps.length === 0) {
        console.error(kleur.red('No fleet IPs found in state and no --ip provided. Deploy instances first or specify --ip.'));
        process.exit(1);
      }
      ip = fleetIps[0]!;
    }

    const proxied = opts.proxied ?? false;
    const dryRun = opts.dryRun ?? false;

    if (dryRun) {
      console.log(kleur.bold('\n📋 DNS Set Plan'));
      console.log(kleur.dim('─'.repeat(40)));
      console.log(`${kleur.cyan('Hostname:'.padEnd(14))} ${hostname}`);
      console.log(`${kleur.cyan('IP:'.padEnd(14))} ${ip}`);
      console.log(`${kleur.cyan('TTL:'.padEnd(14))} ${opts.ttl}`);
      console.log(`${kleur.cyan('Proxied:'.padEnd(14))} ${proxied}`);
      console.log(`${kleur.cyan('Provider:'.padEnd(14))} ${opts.provider}`);
      console.log(kleur.dim('─'.repeat(40)));
      console.log(kleur.dim('Dry-run — no changes made.\n'));
      return;
    }

    try {
      const record = await provider.setRecord(hostname, ip, opts.ttl, proxied, false);
      if (opts.json) {
        formatJsonOutput({ action: 'set', record });
      } else {
        console.log(kleur.green(`\n✅ DNS record set`));
        console.log(formatDnsTable([record]));
        console.log(kleur.dim('DNS propagation may take a few minutes.\n'));
      }
    } catch (err) {
      console.error(kleur.red(`Error setting DNS record: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// dns remove <hostname>
dnsCmd
  .command('remove')
  .description('Remove a DNS record by hostname')
  .argument('<hostname>', 'domain or subdomain to remove')
  .action(async (hostname: string, opts: { json?: boolean; dryRun?: boolean; provider: string }) => {
    const providers = loadDnsProviders();
    const provider = getProvider(opts.provider, providers);

    const dryRun = opts.dryRun ?? false;

    if (dryRun) {
      console.log(kleur.bold('\n📋 DNS Remove Plan'));
      console.log(kleur.dim('─'.repeat(40)));
      console.log(`${kleur.cyan('Hostname:'.padEnd(14))} ${hostname}`);
      console.log(`${kleur.cyan('Provider:'.padEnd(14))} ${opts.provider}`);
      console.log(kleur.dim('─'.repeat(40)));
      console.log(kleur.dim('Dry-run — no changes made.\n'));
      return;
    }

    try {
      const removed = await provider.removeRecord(hostname, false);
      if (opts.json) {
        formatJsonOutput({ action: 'remove', hostname, success: removed });
      } else if (removed) {
        console.log(kleur.green(`\n✅ DNS record removed for ${hostname}\n`));
      }
    } catch (err) {
      console.error(kleur.red(`Error removing DNS record: ${(err as Error).message}`));
      process.exit(1);
    }
  });
