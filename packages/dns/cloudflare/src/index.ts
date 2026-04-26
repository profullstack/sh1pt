import { defineDns, tokenSetup, type DnsRecord } from '@profullstack/sh1pt-core';

// Cloudflare DNS API v4. Auth: Bearer token scoped to Zone.DNS:Edit.
// Endpoints: /client/v4/zones, /client/v4/zones/:id/dns_records
// Cloudflare's 'orange cloud' (proxied=true) routes traffic through the
// CF edge — great default for waitlist pages, but disable it for
// round-robin to VPS backends that can't terminate TLS themselves.
interface Config {
  accountId?: string;
  defaultTtl?: number;           // 1 = auto; otherwise >= 60
  defaultProxied?: boolean;
}

const API = 'https://api.cloudflare.com/client/v4';

export default defineDns<Config>({
  id: 'dns-cloudflare',
  label: 'Cloudflare DNS',

  async connect(ctx) {
    if (!ctx.secret('CLOUDFLARE_API_TOKEN')) throw new Error('CLOUDFLARE_API_TOKEN not set');
    return { accountId: 'cloudflare' };
  },

  async listZones() {
    // TODO: GET ${API}/zones → { result: [{ id, name }] }
    return [];
  },

  async listRecords(zoneId) {
    // TODO: GET ${API}/zones/${zoneId}/dns_records
    return [];
  },

  async upsertRecord(zoneId, record, config) {
    // TODO: POST ${API}/zones/${zoneId}/dns_records (or PUT /:recordId for update)
    const proxied = record.proxied ?? config.defaultProxied ?? false;
    return { id: 'stub', ...record, zone: zoneId, proxied };
  },

  async deleteRecord(zoneId, recordId) {
    // TODO: DELETE ${API}/zones/${zoneId}/dns_records/${recordId}
  },

  async syncRoundRobin({ zoneId, name, ips, ttl, proxied }, config) {
    const ttlFinal = ttl ?? config.defaultTtl ?? 60;
    const proxiedFinal = proxied ?? config.defaultProxied ?? false;
    // TODO: listRecords() → diff → create missing, delete extras, leave matching.
    // Orange-cloud mode (proxied=true) makes CF the A record publicly; use only
    // when backends are sh1pt-deployed VPSes with CF-issued origin certs.
    return ips.map((ip, i) => ({
      id: `cf-stub-${i}`,
      zone: zoneId,
      name,
      type: 'A' as const,
      value: ip,
      ttl: ttlFinal,
      proxied: proxiedFinal,
    })) satisfies DnsRecord[];
  },

  setup: tokenSetup<Config>({
    secretKey: 'CLOUDFLARE_API_TOKEN',
    label: 'Cloudflare DNS',
    vendorDocUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    steps: [
      'Open dash.cloudflare.com → My Profile → API Tokens → Create Token',
      'Use the "Edit zone DNS" template (or custom with Zone.DNS:Edit)',
      'Scope to the zones sh1pt should manage → Continue → Create → copy the token',
    ],
  }),
});
