import { defineCloud, type Instance } from '@sh1pt/core';

// DigitalOcean — great API, predictable pricing, includes Droplets (VPS),
// GPU Droplets (H100), managed Postgres/Mongo/Redis, Spaces (S3-compat).
interface Config {
  apiToken?: string;        // DO_API_TOKEN secret
  projectId?: string;
  defaultRegion?: string;   // nyc3, ams3, sfo3, …
}

export default defineCloud<Config>({
  id: 'cloud-digitalocean',
  label: 'DigitalOcean (VPS, GPU Droplets, Managed DB, Spaces)',
  supports: ['cpu-vps', 'gpu', 'managed-db', 'block-storage', 'object-storage'],

  async connect(ctx) {
    if (!ctx.secret('DO_API_TOKEN')) throw new Error('DO_API_TOKEN not set');
    return { accountId: 'do-account' };
  },

  async quote(ctx, spec) {
    ctx.log(`do quote · kind=${spec.kind}`);
    // TODO: GET /v2/sizes, filter by kind/cpu/memory, return cheapest match
    return { hourly: 0, monthly: 0, currency: 'USD', provider: 'digitalocean', sku: 'stub', spot: false };
  },

  async provision(ctx, spec, config) {
    ctx.log(`do provision · kind=${spec.kind} · region=${spec.region ?? config.defaultRegion ?? 'nyc3'}`);
    if (ctx.dryRun) return stubInstance('dry-run', 'provisioning', spec.kind);
    // TODO: POST /v2/droplets (or /v2/databases for managed DBs)
    return stubInstance(`do_${Date.now()}`, 'provisioning', spec.kind);
  },

  async list() { return []; },
  async destroy(ctx, id) { ctx.log(`do destroy ${id}`); },
  async status(ctx, id) {
    return stubInstance(id, 'running', 'cpu-vps');
  },
});

function stubInstance(id: string, status: Instance['status'], kind: Instance['kind']): Instance {
  return { id, kind, status, createdAt: new Date().toISOString(), hourlyRate: 0, currency: 'USD' };
}
