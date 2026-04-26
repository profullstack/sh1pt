import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  projectId: string;
  only?: string[];
}

export default defineTarget<Config>({
  id: 'deploy-firebase',
  kind: 'web',
  label: 'Firebase Hosting / Functions',
  async build(ctx) {
    ctx.log('firebase emulators:exec --only hosting,functions');
    return { artifact: `${ctx.outDir}/firebase-build` };
  },
  async ship(ctx, config) {
    const only = config.only?.length ? ` --only ${config.only.join(',')}` : '';
    ctx.log(`firebase deploy --project ${config.projectId}${only}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    return { id: `${config.projectId}@${ctx.version}`, url: `https://${config.projectId}.web.app` };
  },
  setup: manualSetup({
    label: 'Firebase CLI',
    vendorDocUrl: 'https://firebase.google.com/docs/cli',
    steps: [
      'Install with mise: mise use npm:firebase-tools',
      'Authenticate: firebase login',
      'For CI: sh1pt secret set FIREBASE_TOKEN <token>',
    ],
  }),
});
