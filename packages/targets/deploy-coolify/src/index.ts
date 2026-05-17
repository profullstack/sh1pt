import { defineTarget, exec, tokenSetup } from '@profullstack/sh1pt-core';

// Coolify — self-hosted PaaS that takes a git repo or docker-compose and
// runs it on your own infra. Two paths sh1pt cares about:
//
//   1. `ship` user's app to a Coolify instance (this adapter)
//   2. Provision a Service from services/<slug> via Coolify's catalog
//      API (handled by the services/* adapters; they delegate here)
//
// API ref: https://coolify.io/docs/api-reference

interface Config {
  baseUrl: string;                 // e.g. 'https://coolify.example.com'
  projectUuid: string;
  serverUuid?: string;
  environmentName?: string;        // e.g. 'production' | 'staging'
  applicationUuid?: string;        // existing app to redeploy
}

export default defineTarget<Config>({
  id: 'deploy-coolify',
  kind: 'web',
  label: 'Coolify',
  async build(ctx) {
    ctx.log(`coolify · build artifact at ${ctx.projectDir}`);
    return { artifact: ctx.projectDir };
  },
  async ship(ctx, config) {
    const env = config.environmentName ?? (ctx.channel === 'stable' ? 'production' : 'staging');
    ctx.log(`coolify · deploy · project=${config.projectUuid} · env=${env}`);
    if (ctx.dryRun) return { id: 'dry-run' };

    const token = ctx.secret('COOLIFY_API_TOKEN');
    if (!token) {
      throw new Error('COOLIFY_API_TOKEN is required. Run: sh1pt secret set COOLIFY_API_TOKEN <token>');
    }

    const deployUuid = config.applicationUuid ?? config.projectUuid;
    ctx.log(`coolify · POST ${config.baseUrl}/api/v1/deploy?uuid=${deployUuid}`);

    const { stdout } = await exec('curl', [
      '-s',
      '-X', 'POST',
      `${config.baseUrl}/api/v1/deploy?uuid=${deployUuid}`,
      '-H', `Authorization: Bearer ${token}`,
    ], {
      log: ctx.log,
      throwOnNonZero: true,
    });

    ctx.log(`coolify · deploy response: ${stdout.trim()}`);

    return {
      id: `${deployUuid}@${ctx.version}`,
      meta: { baseUrl: config.baseUrl, environment: env, rawResponse: stdout.trim() },
    };
  },

  setup: tokenSetup({
    secretKey: 'COOLIFY_API_TOKEN',
    label: 'Coolify',
    vendorDocUrl: 'https://coolify.io/docs/api-reference',
    steps: [
      'Open your Coolify dashboard → Keys & Tokens → API Tokens',
      'Create a token with deploy permissions',
      'Run: sh1pt secret set COOLIFY_API_TOKEN <token>',
      'Run: sh1pt secret set COOLIFY_BASE_URL https://your-coolify-host',
    ],
    fields: [
      { key: 'COOLIFY_BASE_URL', message: 'Coolify base URL (https://...):', secret: true, required: true },
    ],
  }),
});
