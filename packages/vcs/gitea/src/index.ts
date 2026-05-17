import { defineVcs, tokenSetup, type Release, type PullRequest, type Issue } from '@profullstack/sh1pt-core';

// Gitea / Forgejo / Codeberg — GitHub-compatible REST at /api/v1/*.
// Self-hosted is the common case; host is required.
interface Config {
  host: string;                 // e.g. 'gitea.yourco.com' or 'codeberg.org'
  owner: string;
  repo: string;
  defaultBranch?: string;
}

interface GiteaReleaseResponse {
  id: number | string;
  tag_name: string;
  html_url: string;
}

interface GiteaPullResponse {
  id: number | string;
  number: number;
  html_url: string;
  state: 'open' | 'closed' | string;
  merged?: boolean;
}

interface GiteaIssueResponse {
  id: number | string;
  number: number;
  html_url: string;
  state: 'open' | 'closed' | string;
}

interface GiteaHookResponse {
  id: number | string;
}

export default defineVcs<Config>({
  id: 'vcs-gitea',
  label: 'Gitea / Forgejo / Codeberg',

  async connect(ctx, config) {
    if (!ctx.secret('GITEA_TOKEN')) throw new Error('GITEA_TOKEN not in vault');
    ctx.log(`gitea connected · ${config.host}/${config.owner}/${config.repo}`);
    return { accountId: `${config.owner}/${config.repo}` };
  },

  async createRelease(ctx, spec, config): Promise<Release> {
    ctx.log(`gitea release · ${config.owner}/${config.repo} · tag=${spec.tag}`);
    if (isOfflineToken(ctx)) return stubRelease(spec, config);

    const release = await giteaRequest<GiteaReleaseResponse>(ctx, config, `/repos/${repoPath(config)}/releases`, {
      method: 'POST',
      body: {
        tag_name: spec.tag,
        target_commitish: spec.targetCommitish ?? config.defaultBranch,
        name: spec.name ?? spec.tag,
        body: spec.body,
        draft: spec.draft ?? false,
        prerelease: spec.prerelease ?? false,
      },
    });

    return {
      id: String(release.id),
      tag: release.tag_name,
      url: release.html_url,
      uploadedAssets: [],
    };
  },

  async createPullRequest(ctx, spec, config): Promise<PullRequest> {
    ctx.log(`gitea pr · ${spec.head} → ${spec.base}`);
    if (isOfflineToken(ctx)) return stubPullRequest(config);

    const pull = await giteaRequest<GiteaPullResponse>(ctx, config, `/repos/${repoPath(config)}/pulls`, {
      method: 'POST',
      body: {
        head: spec.head,
        base: spec.base || config.defaultBranch || 'main',
        title: spec.title,
        body: spec.body,
        draft: spec.draft ?? false,
      },
    });

    return {
      id: String(pull.id),
      number: pull.number,
      state: pull.merged ? 'merged' : pullRequestState(pull.state),
      url: pull.html_url,
    };
  },

  async createIssue(ctx, spec, config): Promise<Issue> {
    ctx.log(`gitea issue · "${spec.title}"`);
    if (isOfflineToken(ctx)) return stubIssue(config);

    const issue = await giteaRequest<GiteaIssueResponse>(ctx, config, `/repos/${repoPath(config)}/issues`, {
      method: 'POST',
      body: {
        title: spec.title,
        body: spec.body,
        labels: numericIds(spec.labels),
        assignees: spec.assignees,
      },
    });

    return {
      id: String(issue.id),
      number: issue.number,
      state: issueState(issue.state),
      url: issue.html_url,
    };
  },

  async createWebhook(ctx, spec, config) {
    ctx.log(`gitea webhook · ${spec.url}`);
    if (isOfflineToken(ctx)) return { id: `gt_hook_${Date.now()}` };

    const hook = await giteaRequest<GiteaHookResponse>(ctx, config, `/repos/${repoPath(config)}/hooks`, {
      method: 'POST',
      body: {
        type: 'gitea',
        active: true,
        events: spec.events,
        config: {
          url: spec.url,
          content_type: 'json',
          secret: spec.secret,
        },
      },
    });

    return { id: String(hook.id) };
  },

  setup: tokenSetup<Config>({
    secretKey: 'GITEA_TOKEN',
    label: 'Gitea / Forgejo / Codeberg',
    vendorDocUrl: 'https://docs.gitea.com/development/api-usage#authentication',
    steps: [
      'Open <your-gitea-host>/user/settings/applications',
      'Generate New Token → select scopes (repo, issue, pull_request, release)',
      'Copy the token (shown once)',
    ],
    fields: [
      { key: 'host', message: 'Host (e.g. "codeberg.org" or "gitea.yourco.com"):', required: true },
      { key: 'owner', message: 'Owner / org:', required: true },
      { key: 'repo', message: 'Repo name:', required: true },
    ],
  }),
});

function repoPath(config: Config): string {
  return `${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
}

function baseUrl(config: Config): string {
  const host = config.host.replace(/\/+$/, '');
  return /^https?:\/\//.test(host) ? host : `https://${host}`;
}

function isOfflineToken(ctx: { secret(k: string): string | undefined }): boolean {
  return ctx.secret('GITEA_TOKEN') === 'test';
}

async function giteaRequest<T = unknown>(
  ctx: { secret(k: string): string | undefined },
  config: Config,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = ctx.secret('GITEA_TOKEN');
  if (!token) throw new Error('GITEA_TOKEN not in vault');

  const response = await fetch(`${baseUrl(config)}/api/v1${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
    },
    body: options.body === undefined ? undefined : JSON.stringify(stripUndefined(options.body)),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new Error(`Gitea ${options.method ?? 'GET'} ${path} failed: ${response.status} ${giteaErrorMessage(data, response.statusText)}`);
  }

  return data as T;
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, stripUndefined(v)]),
  );
}

function giteaErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data && 'message' in data && typeof (data as { message?: unknown }).message === 'string') {
    return (data as { message: string }).message;
  }
  if (typeof data === 'object' && data && 'errors' in data) return JSON.stringify((data as { errors: unknown }).errors);
  return fallback;
}

function numericIds(values?: string[]): number[] | undefined {
  if (!values?.length) return undefined;
  const ids = values.map((v) => Number(v)).filter(Number.isInteger);
  return ids.length ? ids : undefined;
}

function pullRequestState(state: string): PullRequest['state'] {
  return state === 'closed' ? 'closed' : 'open';
}

function issueState(state: string): Issue['state'] {
  return state === 'closed' ? 'closed' : 'open';
}

function stubRelease(spec: { tag: string }, config: Config): Release {
  return {
    id: `gt_rel_${Date.now()}`,
    tag: spec.tag,
    url: `${baseUrl(config)}/${config.owner}/${config.repo}/releases/tag/${spec.tag}`,
    uploadedAssets: [],
  };
}

function stubPullRequest(config: Config): PullRequest {
  return {
    id: `gt_pr_${Date.now()}`,
    number: 1,
    state: 'open',
    url: `${baseUrl(config)}/${config.owner}/${config.repo}/pulls/1`,
  };
}

function stubIssue(config: Config): Issue {
  return {
    id: `gt_iss_${Date.now()}`,
    number: 1,
    state: 'open',
    url: `${baseUrl(config)}/${config.owner}/${config.repo}/issues/1`,
  };
}
