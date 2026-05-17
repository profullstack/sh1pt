import { defineDns, type DnsRecord } from '@profullstack/sh1pt-core';

// Google Cloud DNS REST API v1. Auth: OAuth 2.0 service account
// (or Application Default Credentials via GOOGLE_APPLICATION_CREDENTIALS).
// Endpoints (base: https://dns.googleapis.com/dns/v1):
//   GET  /projects/:project/managedZones                   — list zones
//   GET  /projects/:project/managedZones/:zone/rrsets      — list records
//   POST /projects/:project/managedZones/:zone/changes     — create/delete (atomic)
// Google Cloud DNS: use ALIAS record sets (type=A with aliasTargetName) to
// point the zone apex to a Cloud resource; use CNAME for non-apex targets.
// Records are grouped into ResourceRecordSets (rrsets) — one set per name+type.
interface Config {
  projectId?: string;
  defaultTtl?: number;
}

const API = 'https://dns.googleapis.com/dns/v1';
let _secret: (k: string) => string | undefined = () => undefined;

async function getAccessToken(): Promise<string> {
  // Prefer GOOGLE_ACCESS_TOKEN (pre-fetched by caller or CI) for simplicity.
  // For service-account flow, use GOOGLE_APPLICATION_CREDENTIALS path.
  const staticToken = _secret('GOOGLE_ACCESS_TOKEN');
  if (staticToken) return staticToken;
  // Fallback: metadata server (works on GCP Compute / Cloud Run)
  // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request
  // Google metadata service uses link-local HTTP endpoint by design.
  const res = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } },
  );
  if (!res.ok) throw new Error('Google Cloud DNS: cannot get access token (set GOOGLE_ACCESS_TOKEN)');
  const { access_token } = await res.json() as { access_token: string };
  return access_token;
}

export default defineDns<Config>({
  id: 'dns-googledns',
  label: 'Google Cloud DNS',

  async connect(ctx) {
    _secret = (k) => ctx.secret(k);
    if (!ctx.secret('GOOGLE_ACCESS_TOKEN') && !ctx.secret('GOOGLE_APPLICATION_CREDENTIALS')) {
      throw new Error('GOOGLE_ACCESS_TOKEN not set — run `sh1pt secret set GOOGLE_ACCESS_TOKEN ...` (required, or set GOOGLE_APPLICATION_CREDENTIALS for service-account flow)');
    }
    if (!ctx.secret('GOOGLE_PROJECT_ID')) {
      throw new Error('GOOGLE_PROJECT_ID not set — run `sh1pt secret set GOOGLE_PROJECT_ID ...` (required)');
    }
    await getAccessToken();
    return { accountId: 'googledns' };
  },

  async listZones(config) {
    const token = await getAccessToken();
    const project = config.projectId ?? _secret('GOOGLE_PROJECT_ID');
    if (!project) throw new Error('GOOGLE_PROJECT_ID not set');
    const res = await fetch(`${API}/projects/${project}/managedZones`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Google Cloud DNS listZones: ${res.status}`);
    const { managedZones } = await res.json() as { managedZones?: { name: string; dnsName: string }[] };
    return (managedZones ?? []).map(z => ({
      id: z.name,
      name: z.dnsName.replace(/\.$/, ''),
    }));
  },

  async listRecords(zoneId, config) {
    const token = await getAccessToken();
    const project = config.projectId ?? _secret('GOOGLE_PROJECT_ID');
    if (!project) throw new Error('GOOGLE_PROJECT_ID not set');
    const res = await fetch(`${API}/projects/${project}/managedZones/${zoneId}/rrsets`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Google Cloud DNS listRecords: ${res.status}`);
    const { rrsets } = await res.json() as {
      rrsets?: { name: string; type: string; ttl: number; rrdatas: string[] }[];
    };
    const records: DnsRecord[] = [];
    for (const rs of rrsets ?? []) {
      const name = rs.name.replace(/\.$/, '');
      for (const val of rs.rrdatas) {
        records.push({
          id: `${rs.type}/${rs.name}`,
          zone: zoneId,
          name,
          type: rs.type as DnsRecord['type'],
          value: val.replace(/\.$/, ''),
          ttl: rs.ttl,
        });
      }
    }
    return records;
  },

  async upsertRecord(zoneId, record, config) {
    const token = await getAccessToken();
    const project = config.projectId ?? _secret('GOOGLE_PROJECT_ID');
    if (!project) throw new Error('GOOGLE_PROJECT_ID not set');
    const ttl = record.ttl ?? config.defaultTtl ?? 300;
    const name = record.name.endsWith('.') ? record.name : `${record.name}.`;

    // Google Cloud DNS changes are atomic: DELETE old + ADD new in one call.
    const existing = (await this.listRecords(zoneId, config)).filter(
      r => r.name === record.name && r.type === record.type,
    );
    const deletions = existing.length > 0
      ? [{ name, type: record.type, ttl, rrdatas: existing.map(r => r.value) }]
      : [];
    const additions = [{ name, type: record.type, ttl, rrdatas: [record.value] }];

    const res = await fetch(`${API}/projects/${project}/managedZones/${zoneId}/changes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'dns#change', deletions, additions }),
    });
    if (!res.ok) throw new Error(`Google Cloud DNS upsertRecord: ${res.status}`);
    return { ...record, id: `${record.type}/${name}`, zone: zoneId };
  },

  async deleteRecord(zoneId, recordId, config) {
    // recordId = "<type>/<FQDN>" e.g. "A/example.com."
    const token = await getAccessToken();
    const project = config.projectId ?? _secret('GOOGLE_PROJECT_ID');
    if (!project) throw new Error('GOOGLE_PROJECT_ID not set');
    const [type, name] = recordId.split('/');
    // Need to fetch the rrset to get current rrdatas for the deletion entry.
    const existing = (await this.listRecords(zoneId, config)).filter(
      r => r.type === type && (r.name === name || r.name === name.replace(/\.$/, '')),
    );
    if (existing.length === 0) return;
    const fqdn = name.endsWith('.') ? name : `${name}.`;
    const ttl = existing[0].ttl;
    const res = await fetch(`${API}/projects/${project}/managedZones/${zoneId}/changes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'dns#change',
        deletions: [{ name: fqdn, type, ttl, rrdatas: existing.map(r => r.value) }],
        additions: [],
      }),
    });
    if (!res.ok && res.status !== 404) throw new Error(`Google Cloud DNS deleteRecord: ${res.status}`);
  },

  async syncRoundRobin({ zoneId, name, ips, ttl }, config) {
    // Stubbed: shape-only return. Real impl POSTs an atomic change
    // (deletions + additions) to managedZones/${zoneId}/changes.
    const ttlFinal = ttl ?? config.defaultTtl ?? 300;
    return ips.map((ip, i) => ({
      id: `gcp-rr-${i}`,
      zone: zoneId,
      name,
      type: 'A' as const,
      value: ip,
      ttl: ttlFinal,
    })) satisfies DnsRecord[];
  },
});
