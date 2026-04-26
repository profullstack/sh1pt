import { defineCloud, tokenSetup, type Instance } from '@profullstack/sh1pt-core';

// Cloudflare — not a traditional IaaS (no VMs to rent), but sh1pt models
// the provisionable primitives: Workers (compute), R2 (object storage),
// D1 (managed SQL), Queues, Tunnels. Pair with deploy-workers target for
// the actual code deployment.
interface Config {
  accountId?: string;
  // which Cloudflare resource to create when .provision() is called
  resourceType?: 'worker' | 'r2-bucket' | 'd1-database' | 'queue' | 'tunnel';
}

export default defineCloud<Config>({
  id: 'cloud-cloudflare',
  label: 'Cloudflare (Workers / R2 / D1 / Queues)',
  supports: ['object-storage', 'managed-db'],
  // note: cpu-vps and gpu aren't in .supports because CF doesn't sell raw
  // VMs. If you need raw compute pair this with cloud-runpod / cloud-do.

  async connect(ctx) {
    if (!ctx.secret('CLOUDFLARE_API_TOKEN')) throw new Error('CLOUDFLARE_API_TOKEN not set');
    return { accountId: 'cloudflare' };
  },

  async quote(ctx) {
    ctx.log('cloudflare quote');
    // R2: $0.015/GB/month storage + $0 egress. Workers: included on paid plans.
    // D1: generous free tier, then read/write row pricing.
    return { hourly: 0, monthly: 0, currency: 'USD', provider: 'cloudflare', sku: 'stub', spot: false };
  },

  async provision(ctx, spec, config) {
    ctx.log(`wrangler ${config.resourceType ?? 'r2-bucket'} create`);
    if (ctx.dryRun) return stub('dry-run', 'provisioning', spec.kind);
    // TODO per resourceType:
    //  'r2-bucket'    → POST /accounts/:id/r2/buckets
    //  'd1-database'  → POST /accounts/:id/d1/database
    //  'queue'        → POST /accounts/:id/queues
    //  'tunnel'       → POST /accounts/:id/cfd_tunnel
    //  'worker'       → PUT /accounts/:id/workers/scripts/:name
    return stub(`cf_${Date.now()}`, 'provisioning', spec.kind);
  },

  async list(ctx) { ctx.log('wrangler whoami && wrangler r2 bucket list'); return []; },
  async destroy(ctx, id) { ctx.log(`wrangler delete ${id}`); },
  async status(ctx, id) { ctx.log(`wrangler deployments list --name ${id}`); return stub(id, 'running', 'object-storage'); },

  setup: tokenSetup({
    secretKey: 'CLOUDFLARE_API_TOKEN',
    label: 'Cloudflare (cloud)',
    vendorDocUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    steps: [
      'Install with mise: mise use npm:wrangler',
      'Authenticate locally: wrangler login',
      'Open https://dash.cloudflare.com/profile/api-tokens',
      'Create an API token with full / read-write scope',
      'Copy the token (usually shown once)',
    ],
  }),
});

function stub(id: string, status: Instance['status'], kind: Instance['kind']): Instance {
  return { id, kind, status, createdAt: new Date().toISOString(), hourlyRate: 0, currency: 'USD' };
}
