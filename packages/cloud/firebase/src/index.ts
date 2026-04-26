import { defineCloud, manualSetup, type Instance } from '@profullstack/sh1pt-core';

interface Config {
  projectId: string;
}

export default defineCloud<Config>({
  id: 'cloud-firebase',
  label: 'Firebase (Hosting / Functions / Firestore / Storage)',
  supports: ['managed-db', 'object-storage'],

  async connect(ctx, config) {
    if (!ctx.secret('FIREBASE_TOKEN') && !ctx.secret('GOOGLE_APPLICATION_CREDENTIALS')) {
      throw new Error('FIREBASE_TOKEN or GOOGLE_APPLICATION_CREDENTIALS not in vault');
    }
    ctx.log(`firebase projects:list · active=${config.projectId}`);
    return { accountId: config.projectId };
  },
  async quote(ctx, spec) {
    ctx.log(`firebase quote · kind=${spec.kind}`);
    return { hourly: 0, monthly: 0, currency: 'USD', provider: 'firebase', sku: 'blaze', spot: false };
  },
  async provision(ctx, spec, config) {
    ctx.log(`firebase use ${config.projectId} · resource=${spec.kind}`);
    if (ctx.dryRun) return stub('dry-run', 'provisioning', spec.kind);
    return stub(config.projectId, 'running', spec.kind);
  },
  async list(ctx) {
    ctx.log('firebase projects:list --json');
    return [];
  },
  async destroy(ctx, id) {
    ctx.log(`firebase projects:delete ${id}`);
  },
  async status(ctx, id) {
    ctx.log(`firebase use ${id}`);
    return stub(id, 'running', 'managed-db');
  },

  setup: manualSetup({
    label: 'Firebase CLI',
    vendorDocUrl: 'https://firebase.google.com/docs/cli',
    steps: [
      'Install with mise: mise use npm:firebase-tools',
      'Authenticate: firebase login',
      'For CI: firebase login:ci, then sh1pt secret set FIREBASE_TOKEN <token>',
    ],
  }),
});

function stub(id: string, status: Instance['status'], kind: Instance['kind']): Instance {
  return { id, kind, status, createdAt: new Date().toISOString(), hourlyRate: 0, currency: 'USD' };
}
