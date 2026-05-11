import { defineObservabilityProvider, exec, manualSetup, type ObservabilityRelease } from '@profullstack/sh1pt-core';

interface Config {
  org: string;
  project: string;
}

export default defineObservabilityProvider<Config>({
  id: 'observability-sentry',
  label: 'Sentry',
  cli: 'sentry-cli',
  async connect(ctx, config) {
    if (!ctx.secret('SENTRY_AUTH_TOKEN')) throw new Error('SENTRY_AUTH_TOKEN not in vault — run: sh1pt secret set SENTRY_AUTH_TOKEN <token>');
    ctx.log(`sentry-cli info · org=${config.org} · project=${config.project}`);
    return { accountId: `${config.org}/${config.project}` };
  },
  async createRelease(ctx, release: ObservabilityRelease, config) {
    const token = ctx.secret('SENTRY_AUTH_TOKEN');
    if (!token) throw new Error('SENTRY_AUTH_TOKEN not in vault — run: sh1pt secret set SENTRY_AUTH_TOKEN <token>');

    const version = release.version;
    const project = release.project ?? config.project;
    const common = ['--org', config.org, '--project', project];
    const env = { SENTRY_AUTH_TOKEN: token };

    ctx.log(`sentry-cli releases new ${version} --org ${config.org} --project ${project}`);
    await exec('sentry-cli', ['releases', 'new', version, ...common], { log: ctx.log, env });

    for (const artifact of release.artifacts ?? []) {
      ctx.log(`sentry-cli sourcemaps upload ${artifact} --release ${version}`);
      await exec('sentry-cli', [
        'sourcemaps', 'upload', artifact,
        '--release', version,
        ...common,
      ], { log: ctx.log, env });
    }

    await exec('sentry-cli', ['releases', 'finalize', version, ...common], { log: ctx.log, env });

    if (release.environment) {
      await exec('sentry-cli', [
        'releases', 'deploys', version, 'new',
        '--env', release.environment,
        '--org', config.org,
      ], { log: ctx.log, env });
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
