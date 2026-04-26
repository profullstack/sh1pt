import { defineObservabilityProvider, manualSetup, type ObservabilityRelease } from '@profullstack/sh1pt-core';

interface Config {
  org: string;
  project: string;
}

export default defineObservabilityProvider<Config>({
  id: 'observability-sentry',
  label: 'Sentry',
  cli: 'sentry-cli',
  async connect(ctx, config) {
    if (!ctx.secret('SENTRY_AUTH_TOKEN')) throw new Error('SENTRY_AUTH_TOKEN not in vault');
    ctx.log(`sentry-cli info · org=${config.org} · project=${config.project}`);
    return { accountId: `${config.org}/${config.project}` };
  },
  async createRelease(ctx, release: ObservabilityRelease, config) {
    const version = release.version;
    ctx.log(`sentry-cli releases new ${version} --org ${config.org} --project ${config.project}`);
    for (const artifact of release.artifacts ?? []) {
      ctx.log(`sentry-cli sourcemaps upload ${artifact} --release ${version}`);
    }
    return { id: version, url: `https://sentry.io/organizations/${config.org}/releases/${version}/` };
  },
  setup: manualSetup({
    label: 'Sentry CLI',
    vendorDocUrl: 'https://cli.sentry.dev/',
    steps: [
      'Install sentry-cli from the official docs',
      'Create an auth token with project:releases and org:read scopes',
      'Run: sh1pt secret set SENTRY_AUTH_TOKEN <token>',
    ],
  }),
});
