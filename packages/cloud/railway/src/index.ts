import { defineCloud, type Instance } from '@profullstack/sh1pt-core';

// Railway — app hosting with a GraphQL API. Not a raw-VPS provider,
// but sh1pt models each Railway *service* as an instance for scaling
// purposes. `sh1pt scale up --provider cloud-railway` bumps replica
// count; `destroy` removes the service.
interface Config {
  projectId?: string;
  serviceId?: string;
  environmentId?: string;
  region?: string;                    // us-east, us-west, europe-west, etc.
}

const API = 'https://backboard.railway.app/graphql/v2';

export default defineCloud<Config>({
  id: 'cloud-railway',
  label: 'Railway (scalable services)',
  supports: ['cpu-vps', 'managed-db', 'object-storage'],

  async connect(ctx) {
    if (!ctx.secret('RAILWAY_TOKEN')) throw new Error('RAILWAY_TOKEN not set');
    return { accountId: 'railway' };
  },

  async quote(ctx, spec) {
    ctx.log(`railway quote · kind=${spec.kind}`);
    // Railway pricing is per-minute vCPU + memory (Hobby/Pro plan). Quote
    // is a projection from Railway's resource-usage API.
    return { hourly: 0, monthly: 0, currency: 'USD', provider: 'railway', sku: 'stub', spot: false };
  },

  async provision(ctx, spec, config) {
    ctx.log(`railway provision · project=${config.projectId}`);
    if (ctx.dryRun) return stub('dry-run', 'provisioning', spec.kind);
    // TODO: GraphQL mutation serviceCreate({ projectId, name, source: { repo / image } })
    // For GPU workloads, Railway isn't viable — flag to user and suggest cloud-runpod.
    return stub(`rw_${Date.now()}`, 'provisioning', spec.kind);
  },

  async list() { return []; },
  async destroy(ctx, id) { ctx.log(`railway destroy service=${id}`); },
  async status(ctx, id) { return stub(id, 'running', 'cpu-vps'); },
});

function stub(id: string, status: Instance['status'], kind: Instance['kind']): Instance {
  return { id, kind, status, createdAt: new Date().toISOString(), hourlyRate: 0, currency: 'USD' };
}
