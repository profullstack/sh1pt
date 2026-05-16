import { defineTarget, manualSetup, exec } from '@profullstack/sh1pt-core';

interface Config {
  project?: string;
  org?: string;
  prod?: boolean;
}

export default defineTarget<Config>({
  id: 'deploy-vercel',
  kind: 'web',
  label: 'Vercel',
  async build(ctx, config) {
    const prod = config.prod ?? ctx.channel === 'stable';
    ctx.log(`vercel build${prod ? ' --prod' : ''}`);

    const token = ctx.secret('VERCEL_TOKEN');
    if (!token) throw new Error('VERCEL_TOKEN secret not set. Run: sh1pt secret set VERCEL_TOKEN <token>');

    const args: string[] = ['build'];
    if (prod) args.push('--prod');

    await exec('vercel', args, {
      cwd: ctx.projectDir,
      log: ctx.log,
      throwOnNonZero: true,
      env: { VERCEL_TOKEN: token },
    });

    return { artifact: `${ctx.outDir}/vercel-output` };
  },
  async ship(ctx, config) {
    const prod = config.prod ?? ctx.channel === 'stable';
    ctx.log(`vercel deploy${prod ? ' --prod' : ''} · project=${config.project ?? 'linked'}`);
    if (ctx.dryRun) return { id: 'dry-run' };

    const token = ctx.secret('VERCEL_TOKEN');
    if (!token) {
      throw new Error(
        'VERCEL_TOKEN is required for deployment. ' +
          'Create a token at vercel.com/account/tokens, ' +
          'then set it: sh1pt secret set VERCEL_TOKEN <token>'
      );
    }

    const args: string[] = ['deploy', '--token', token];
    if (prod) args.push('--prod');

    const { stdout } = await exec('vercel', args, {
      cwd: ctx.projectDir,
      log: ctx.log,
      throwOnNonZero: true,
      env: { VERCEL_TOKEN: token },
    });

    // Vercel prints the deployment URL as the last line of stdout
    // e.g. "https://my-project-abc123.vercel.app"
    const lines = stdout.trim().split('\n').filter(Boolean);
    const urlMatch = stdout.match(/https:\/\/[a-zA-Z0-9.-]+\.vercel\.app/);
    const url = urlMatch?.[0] ?? lines[lines.length - 1]?.trim();

    const projectLabel = config.project ?? 'vercel';
    const id = `${projectLabel}@${ctx.version}`;

    ctx.log(`vercel deploy complete · id=${id} · url=${url}`);
    return { id, url };
  },
  setup: manualSetup({
    label: 'Vercel CLI',
    vendorDocUrl: 'https://vercel.com/docs/cli',
    steps: [
      'Install with mise: mise use npm:vercel',
      'Authenticate: vercel login',
      'For CI: sh1pt secret set VERCEL_TOKEN <token>',
      'Link once if needed: vercel link',
    ],
  }),
});
