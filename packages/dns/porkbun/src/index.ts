import { defineDns, type DnsRecord } from '@profullstack/sh1pt-core';

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

export default defineDns<Config>({
  id: 'dns-porkbun',
  label: 'Porkbun DNS',

  async connect(ctx) {
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
    // TODO: POST ${API}/dns/retrieve/${zoneId} with { apikey, secretapikey }
    // Map response.records to DnsRecord[]
    return [];
  },

  async upsertRecord(zoneId, record) {
    // TODO: check existing via retrieve, then create or edit as appropriate.
    // POST ${API}/dns/create/${zoneId} with { apikey, secretapikey, name, type, content, ttl, prio? }
    return { id: 'stub', zone: zoneId, ...record };
  },

  async deleteRecord(zoneId, recordId) {
    // TODO: POST ${API}/dns/delete/${zoneId}/${recordId}
  },

  async syncRoundRobin({ zoneId, name, ips, ttl }) {
    // Diff current A records at <name> vs desired `ips`. Create missing,
    // delete extras, leave matching untouched. Porkbun doesn't weight A
    // records; clients round-robin by DNS resolver behaviour.
    // TODO: real diff against listRecords()
    const ttlFinal = ttl ?? 600;
    return ips.map((ip, i) => ({
      id: `stub-${i}`,
      zone: zoneId,
      name,
      type: 'A' as const,
      value: ip,
      ttl: ttlFinal,
    })) satisfies DnsRecord[];
  },
});
