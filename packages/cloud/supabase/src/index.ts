import { defineCloud, manualSetup, type Instance } from '@profullstack/sh1pt-core';

interface Config {
  projectRef?: string;
  orgId?: string;
  region?: string;
}

export default defineCloud<Config>({
  id: 'cloud-supabase',
  label: 'Supabase (Postgres / Auth / Storage / Edge Functions)',
  supports: ['managed-db', 'object-storage'],

  async connect(ctx, config) {
    if (!ctx.secret('SUPABASE_ACCESS_TOKEN')) throw new Error('SUPABASE_ACCESS_TOKEN not in vault');
    ctx.log(`supabase connected · project=${config.projectRef ?? 'linked'}`);
    return { accountId: config.projectRef ?? 'supabase' };
  },
  async quote(ctx, spec) {
    ctx.log(`supabase quote · kind=${spec.kind}`);
    return { hourly: 0, monthly: 0, currency: 'USD', provider: 'supabase', sku: 'project', spot: false };
  },
  async provision(ctx, spec, config) {
    ctx.log(`supabase projects create · org=${config.orgId ?? 'default'} · region=${spec.region ?? config.region ?? 'default'}`);
    if (ctx.dryRun) return stub('dry-run', 'provisioning', spec.kind);
    // TODO: `supabase projects create` once project creation flags are stabilized for CI.
    return stub(`sb_${Date.now()}`, 'provisioning', spec.kind);
  },
  async list(ctx) {
    ctx.log('supabase projects list');
    return [];
  },
  async destroy(ctx, id) {
    ctx.log(`supabase projects delete ${id}`);
  },
  async status(ctx, id) {
    ctx.log(`supabase projects api-keys --project-ref ${id}`);
    return stub(id, 'running', 'managed-db');
  },

  setup: manualSetup({
    label: 'Supabase CLI',
    vendorDocUrl: 'https://supabase.com/docs/guides/cli/getting-started',
    steps: [
      'Install with mise: mise use npm:supabase',
      'Authenticate: supabase login',
      'For CI: sh1pt secret set SUPABASE_ACCESS_TOKEN <token>',
      'Link a project when needed: supabase link --project-ref <ref>',
    ],
  }),
});

function stub(id: string, status: Instance['status'], kind: Instance['kind']): Instance {
  return { id, kind, status, createdAt: new Date().toISOString(), hourlyRate: 0, currency: 'USD' };
}
