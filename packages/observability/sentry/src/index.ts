import { defineObservabilityProvider, manualSetup, type ObservabilityRelease } from '@profullstack/sh1pt-core';

interface Config {
  org: string;
  project: string;
  baseUrl?: string;
}

type SentryReleaseResponse = {
  version?: string;
  url?: string;
};

const DEFAULT_BASE_URL = 'https://sentry.io';
const SENTRY_TOKEN_SECRET = 'SENTRY_AUTH_TOKEN';

function sentryBaseUrl(config: Config): string {
  return (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
}

function apiUrl(config: Config, path: string): string {
  return `${sentryBaseUrl(config)}/api/0${path}`;
}

function authorizationHeader(token: string): string {
  return token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
}

async function sentryPost<T>(token: string, url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authorizationHeader(token),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sentry API request failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return await response.json() as T;
}

export default defineObservabilityProvider<Config>({
  id: 'observability-sentry',
  label: 'Sentry',
  cli: 'sentry-cli',
  async connect(ctx, config) {
    if (!ctx.secret(SENTRY_TOKEN_SECRET)) throw new Error(`${SENTRY_TOKEN_SECRET} not in vault`);
    ctx.log(`sentry-cli info · org=${config.org} · project=${config.project}`);
    return { accountId: `${config.org}/${config.project}` };
  },
  async createRelease(ctx, release: ObservabilityRelease, config) {
    const token = ctx.secret(SENTRY_TOKEN_SECRET);
    if (!token) throw new Error(`${SENTRY_TOKEN_SECRET} not in vault`);
    const version = release.version;
    const project = release.project ?? config.project;
    ctx.log(`sentry release create · org=${config.org} · project=${project} · version=${version}`);

    const created = await sentryPost<SentryReleaseResponse>(
      token,
      apiUrl(config, `/organizations/${config.org}/releases/`),
      { version, projects: [project] },
    );

    if (release.environment) {
      ctx.log(`sentry deploy create · release=${version} · environment=${release.environment}`);
      await sentryPost<Record<string, unknown>>(
        token,
        apiUrl(config, `/organizations/${config.org}/releases/${encodeURIComponent(version)}/deploys/`),
        { environment: release.environment },
      );
    }

    for (const artifact of release.artifacts ?? []) {
      ctx.log(`sentry-cli sourcemaps upload ${artifact} --release ${version}`);
    }
    return {
      id: created.version ?? version,
      url: created.url ?? `${sentryBaseUrl(config)}/organizations/${config.org}/releases/${encodeURIComponent(version)}/`,
    };
  },
  setup: manualSetup({
    label: 'Sentry CLI',
    vendorDocUrl: 'https://docs.sentry.io/api/releases/create-a-new-release-for-an-organization/',
    steps: [
      'Create a Sentry auth token with project:releases scope',
      'Add org:read too if you also use sentry-cli locally',
      'Run: sh1pt secret set SENTRY_AUTH_TOKEN <token>',
    ],
  }),
});
