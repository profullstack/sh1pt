import { defineCloud, type Instance } from '@profullstack/sh1pt-core';

// Hetzner Cloud — cheapest per-core pricing of any major EU host.
// Includes VPS, dedicated bare metal, load balancers, S3-compat storage.
interface Config {
  apiToken?: string;          // HETZNER_API_TOKEN
  defaultLocation?: string;   // fsn1, nbg1, hel1, ash, hil
}

export default defineCloud<Config>({
  id: 'cloud-hetzner',
  label: 'Hetzner Cloud (VPS, Dedicated)',
  supports: ['cpu-vps', 'bare-metal', 'block-storage', 'object-storage'],

  async connect(ctx) {
    if (!ctx.secret('HETZNER_API_TOKEN')) throw new Error('HETZNER_API_TOKEN not set');
    return { accountId: 'hetzner-account' };
  },
  async quote(ctx, spec) {
    ctx.log(`hetzner quote · kind=${spec.kind}`);
    return { hourly: 0, monthly: 0, currency: 'EUR', provider: 'hetzner', sku: 'stub', spot: false };
  },
  async provision(ctx, spec, config) {
    ctx.log(`hetzner provision · location=${spec.region ?? config.defaultLocation ?? 'fsn1'}`);
    if (ctx.dryRun) return stub('dry-run', 'provisioning', spec.kind);
    // TODO: POST /v1/servers (cloud API) or robot API for dedicated
    return stub(`hz_${Date.now()}`, 'provisioning', spec.kind);
  },
  async list() { return []; },
  async destroy(ctx, id) { ctx.log(`hetzner destroy ${id}`); },
  async status(ctx, id) { return stub(id, 'running', 'cpu-vps'); },
});

function stub(id: string, status: Instance['status'], kind: Instance['kind']): Instance {
  return { id, kind, status, createdAt: new Date().toISOString(), hourlyRate: 0, currency: 'EUR' };
}
