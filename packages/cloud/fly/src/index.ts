import { defineCloud, manualSetup, type Instance } from '@profullstack/sh1pt-core';

interface Config {
  app?: string;
  org?: string;
  region?: string;
}

export default defineCloud<Config>({
  id: 'cloud-fly',
  label: 'Fly.io Machines / Postgres / Volumes',
  supports: ['cpu-vps', 'managed-db', 'block-storage'],

  async connect(ctx, config) {
    if (!ctx.secret('FLY_API_TOKEN')) throw new Error('FLY_API_TOKEN not in vault');
    ctx.log(`flyctl auth whoami · org=${config.org ?? 'default'}`);
    return { accountId: config.org ?? 'fly' };
  },
  async quote(ctx, spec) {
    ctx.log(`fly platform vm-sizes · kind=${spec.kind}`);
    return { hourly: 0, monthly: 0, currency: 'USD', provider: 'fly', sku: 'shared-cpu-1x', spot: false };
  },
  async provision(ctx, spec, config) {
    ctx.log(`flyctl apps create ${config.app ?? '<generated>'} · region=${spec.region ?? config.region ?? 'iad'}`);
    if (ctx.dryRun) return stub('dry-run', 'provisioning', spec.kind);
    return stub(`fly_${Date.now()}`, 'provisioning', spec.kind);
  },
  async list(ctx) {
    ctx.log('flyctl apps list');
    return [];
  },
  async destroy(ctx, id) {
    ctx.log(`flyctl apps destroy ${id} --yes`);
  },
  async status(ctx, id) {
    ctx.log(`flyctl status --app ${id}`);
    return stub(id, 'running', 'cpu-vps');
  },

  setup: manualSetup({
    label: 'Fly.io CLI',
    vendorDocUrl: 'https://fly.io/docs/flyctl/',
    steps: [
      'Install flyctl with the official installer or package manager',
      'Authenticate: flyctl auth login',
      'Create a deploy token: flyctl tokens create deploy',
      'Run: sh1pt secret set FLY_API_TOKEN <token>',
    ],
  }),
});

function stub(id: string, status: Instance['status'], kind: Instance['kind']): Instance {
  return { id, kind, status, createdAt: new Date().toISOString(), hourlyRate: 0, currency: 'USD' };
}
