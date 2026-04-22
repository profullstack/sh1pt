import { defineCloud, type Instance } from '@profullstack/sh1pt-core';

// Vultr — VPS, bare metal, GPU, block/object storage. Clean REST API.
interface Config {
  apiKey?: string;           // VULTR_API_KEY secret
  defaultRegion?: string;    // ewr, lax, ams, etc.
}

export default defineCloud<Config>({
  id: 'cloud-vultr',
  label: 'Vultr (VPS, Bare Metal, GPU)',
  supports: ['cpu-vps', 'gpu', 'bare-metal', 'block-storage', 'object-storage'],

  async connect(ctx) {
    if (!ctx.secret('VULTR_API_KEY')) throw new Error('VULTR_API_KEY not set');
    return { accountId: 'vultr-account' };
  },

  async quote(ctx, spec) {
    ctx.log(`vultr quote · kind=${spec.kind}`);
    return { hourly: 0, monthly: 0, currency: 'USD', provider: 'vultr', sku: 'stub', spot: false };
  },

  async provision(ctx, spec, config) {
    ctx.log(`vultr provision · kind=${spec.kind} · region=${spec.region ?? config.defaultRegion ?? 'ewr'}`);
    if (ctx.dryRun) return stub('dry-run', 'provisioning', spec.kind);
    // TODO: POST /v2/instances (or /v2/bare-metals)
    return stub(`vultr_${Date.now()}`, 'provisioning', spec.kind);
  },

  async list() { return []; },
  async destroy(ctx, id) { ctx.log(`vultr destroy ${id}`); },
  async status(ctx, id) { return stub(id, 'running', 'cpu-vps'); },
});

function stub(id: string, status: Instance['status'], kind: Instance['kind']): Instance {
  return { id, kind, status, createdAt: new Date().toISOString(), hourlyRate: 0, currency: 'USD' };
}
