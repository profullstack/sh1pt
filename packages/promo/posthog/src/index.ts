import { defineAdPlatform, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  projectApiKey: string;      // client-side project API key (ph_xxx)
  personalApiKey?: string;    // management API key — required for experiments + results
  host?: string;              // default: https://us.i.posthog.com
  projectId?: string;         // numeric project id — required for experiment API
}

type ExperimentResponse = {
  id?: number;
  name?: string;
};

type ExperimentResultsResponse = {
  result?: {
    significance?: number;
    variants?: Array<{ name: string; count: number; conversion_rate: number }>;
  };
};

const DEFAULT_HOST = 'https://us.i.posthog.com';
const POSTHOG_KEY_SECRET = 'POSTHOG_PERSONAL_API_KEY';

function apiBase(config: Config): string {
  return (config.host ?? DEFAULT_HOST).replace(/\/$/, '');
}

async function phGet<T>(key: string, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog API error (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

async function phPost<T>(key: string, url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog API error (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export default defineAdPlatform<Config>({
  id: 'promo-posthog',
  label: 'PostHog (Experiments / Analytics)',

  async connect(ctx, config) {
    const key = ctx.secret(POSTHOG_KEY_SECRET) ?? config.personalApiKey;
    if (!key) throw new Error(`${POSTHOG_KEY_SECRET} not in vault`);
    ctx.log(`posthog connect · host=${config.host ?? DEFAULT_HOST}`);
    // TODO: validate key via /api/users/@me once personal-key scope is confirmed
    return { accountId: config.projectId ?? 'unknown' };
  },

  async start(ctx, config) {
    const key = ctx.secret(POSTHOG_KEY_SECRET) ?? config.personalApiKey;
    if (!key) throw new Error(`${POSTHOG_KEY_SECRET} not in vault`);
    if (!config.projectId) throw new Error('projectId required to create experiments');
    ctx.log(`posthog experiment create · project=${config.projectId} · objective=${ctx.objective}`);
    if (ctx.dryRun) return { id: 'dry-run' };

    const creative = ctx.creatives[0];
    const experiment = await phPost<ExperimentResponse>(
      key,
      `${apiBase(config)}/api/projects/${config.projectId}/experiments/`,
      {
        name: creative?.headline ?? ctx.appName,
        description: creative?.description,
        feature_flag_key: `sh1pt-${ctx.appName.toLowerCase().replace(/\s+/g, '-')}-exp`,
        filters: { events: [{ id: '$pageview', type: 'events', order: 0 }] },
        variants: [
          { key: 'control', rollout_percentage: 50 },
          { key: 'test', rollout_percentage: 50 },
        ],
      },
    );

    const id = String(experiment.id ?? Date.now());
    return {
      id,
      url: `${apiBase(config)}/project/${config.projectId}/experiments/${id}`,
    };
  },

  async status(campaignId, config) {
    // TODO: fetch experiment results via personal API key
    if (!config.personalApiKey && !config.projectId) {
      return { state: 'active', spend: 0, impressions: 0, clicks: 0 };
    }
    return { state: 'active', spend: 0, impressions: 0, clicks: 0 };
  },

  async stop(campaignId, config) {
    // TODO: archive experiment via PATCH /api/projects/:id/experiments/:exp_id/
    console.log(`[stub] posthog stop experiment ${campaignId}`);
  },

  setup: manualSetup({
    label: 'PostHog Experiments',
    vendorDocUrl: 'https://posthog.com/docs/api/experiments',
    steps: [
      'Log in to app.posthog.com → Settings → Personal API keys → Create key with project access',
      'Find your Project ID in Project Settings → General',
      'Run: sh1pt secret set POSTHOG_PERSONAL_API_KEY <key>',
    ],
  }),
});
