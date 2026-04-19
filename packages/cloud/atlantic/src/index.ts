import { defineCloud, type Instance } from '@sh1pt/core';

interface Config {
  apiKey?: string;            // ATLANTIC_API_KEY
  secretKey?: string;         // ATLANTIC_SECRET_KEY
  defaultRegion?: string;     // USEAST1, USCENTRAL1, EUWEST1, etc.
}

export default defineCloud<Config>({
  id: 'cloud-atlantic',
  label: 'Atlantic.Net (VPS)',
  supports: ['cpu-vps', 'bare-metal'],

  async connect(ctx) {
    if (!ctx.secret('ATLANTIC_API_KEY')) throw new Error('ATLANTIC_API_KEY not set');
    return { accountId: 'atlantic-account' };
  },
  async quote(ctx, spec) {
    ctx.log(`atlantic quote · kind=${spec.kind}`);
    return { hourly: 0, monthly: 0, currency: 'USD', provider: 'atlantic', sku: 'stub', spot: false };
  },
  async provision(ctx, spec, config) {
    ctx.log(`atlantic provision · region=${spec.region ?? config.defaultRegion ?? 'USEAST1'}`);
    if (ctx.dryRun) return stub('dry-run', 'provisioning', spec.kind);
    return stub(`atl_${Date.now()}`, 'provisioning', spec.kind);
  },
  async list() { return []; },
  async destroy(ctx, id) { ctx.log(`atlantic destroy ${id}`); },
  async status(ctx, id) { return stub(id, 'running', 'cpu-vps'); },
});

function stub(id: string, status: Instance['status'], kind: Instance['kind']): Instance {
  return { id, kind, status, createdAt: new Date().toISOString(), hourlyRate: 0, currency: 'USD' };
}
