import { defineVcs, tokenSetup, type Release, type PullRequest, type Issue } from '@profullstack/sh1pt-core';

// GitLab REST API v4 — works for both gitlab.com and self-hosted.
// "Pull request" is called "Merge Request" here; the adapter exposes
// it as createPullRequest() to stay interface-consistent.
interface Config {
  host?: string;               // 'gitlab.com' or self-hosted host
  projectId: number | string;  // numeric id or 'group/project' path
  defaultBranch?: string;
}

interface GitLabReleaseResponse {
  id: number | string;
  tag_name: string;
  _links?: { self?: string };
}

interface GitLabMergeRequestResponse {
  id: number | string;
  iid: number;
  web_url: string;
  state: 'opened' | 'closed' | 'merged' | string;
}

interface GitLabIssueResponse {
  id: number | string;
  iid: number;
  web_url: string;
  state: 'opened' | 'closed' | string;
}

interface GitLabHookResponse {
  id: number | string;
}

export default defineVcs<Config>({
  id: 'vcs-gitlab',
  label: 'GitLab',

  async connect(ctx, config) {
    if (!ctx.secret('GITLAB_TOKEN')) throw new Error('GITLAB_TOKEN not in vault');
    ctx.log(`gitlab connected · ${config.host ?? 'gitlab.com'} · project=${config.projectId}`);
    return { accountId: String(config.projectId) };
  },

  async createRelease(ctx, spec, config): Promise<Release> {
    ctx.log(`gitlab release · project=${config.projectId} · tag=${spec.tag}`);
    if (isOfflineToken(ctx)) return stubRelease(spec, config);

    const release = await gitlabRequest<GitLabReleaseResponse>(ctx, config, '/releases', {
      method: 'POST',
      body: {
        tag_name: spec.tag,
        name: spec.name ?? spec.tag,
        description: spec.body,
        ref: spec.targetCommitish ?? config.defaultBranch,
        released_at: spec.prerelease ? undefined : new Date().toISOString(),
      },
    });

    return {
      id: String(release.id),
      tag: release.tag_name,
      url: releaseWebUrl(config, spec.tag),
      uploadedAssets: [],
    };
  },

  async createPullRequest(ctx, spec, config): Promise<PullRequest> {
    ctx.log(`gitlab MR · ${spec.head} → ${spec.base}`);
    if (isOfflineToken(ctx)) return stubPullRequest(config);

    const mergeRequest = await gitlabRequest<GitLabMergeRequestResponse>(ctx, config, '/merge_requests', {
      method: 'POST',
      body: {
        source_branch: spec.head,
        target_branch: spec.base || config.defaultBranch || 'main',
        title: spec.title,
        description: spec.body,
        draft: spec.draft ?? false,
        labels: spec.labels?.join(','),
        reviewer_ids: numericIds(spec.reviewers),
      },
    });

    return {
      id: String(mergeRequest.id),
      number: mergeRequest.iid,
      state: mergeRequestState(mergeRequest.state),
      url: mergeRequest.web_url,
    };
  },

  async createIssue(ctx, spec, config): Promise<Issue> {
    ctx.log(`gitlab issue · "${spec.title}"`);
    if (isOfflineToken(ctx)) return stubIssue(config);

    const issue = await gitlabRequest<GitLabIssueResponse>(ctx, config, '/issues', {
      method: 'POST',
      body: {
        title: spec.title,
        description: spec.body,
        labels: spec.labels?.join(','),
        assignee_ids: numericIds(spec.assignees),
      },
    });

    return {
      id: String(issue.id),
      number: issue.iid,
      state: issueState(issue.state),
      url: issue.web_url,
    };
  },

  async createWebhook(ctx, spec, config) {
    ctx.log(`gitlab webhook · ${spec.url}`);
    if (isOfflineToken(ctx)) return { id: `gl_hook_${Date.now()}` };

    const hook = await gitlabRequest<GitLabHookResponse>(ctx, config, '/hooks', {
      method: 'POST',
      body: {
        url: spec.url,
        token: spec.secret,
        ...hookEvents(spec.events),
      },
    });

    return { id: String(hook.id) };
  },

  setup: tokenSetup<Config>({
    secretKey: 'GITLAB_TOKEN',
    label: 'GitLab',
    vendorDocUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens',
    steps: [
      'Install GitLab CLI (`glab`) from the official GitLab docs',
      'Authenticate locally: glab auth login',
      'Open gitlab.com → User Settings → Access Tokens (self-hosted: /-/user_settings/personal_access_tokens)',
      'Scopes: api (full), read_repository, write_repository',
      'Create → copy the token (shown once)',
    ],
    fields: [
      { key: 'host', message: 'Host (blank for gitlab.com):' },
      { key: 'projectId', message: 'Project ID or path (e.g. "12345" or "group/project"):', required: true },
    ],
  }),
});

function projectPath(config: Config): string {
  return encodeURIComponent(String(config.projectId));
}

function baseUrl(config: Config): string {
  const host = (config.host ?? 'gitlab.com').replace(/\/+$/, '');
  return /^https?:\/\//.test(host) ? host : `https://${host}`;
}

function releaseWebUrl(config: Config, tag: string): string {
  return `${baseUrl(config)}/${String(config.projectId)}/-/releases/${encodeURIComponent(tag)}`;
}

function isOfflineToken(ctx: { secret(k: string): string | undefined }): boolean {
  return ctx.secret('GITLAB_TOKEN') === 'test';
}

async function gitlabRequest<T = unknown>(
  ctx: { secret(k: string): string | undefined },
  config: Config,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = ctx.secret('GITLAB_TOKEN');
  if (!token) throw new Error('GITLAB_TOKEN not in vault');

  const response = await fetch(`${baseUrl(config)}/api/v4/projects/${projectPath(config)}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'PRIVATE-TOKEN': token,
    },
    body: options.body === undefined ? undefined : JSON.stringify(stripUndefined(options.body)),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new Error(`GitLab ${options.method ?? 'GET'} project=${config.projectId}${path} failed: ${response.status} ${gitlabErrorMessage(data, response.statusText)}`);
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

function gitlabErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data && 'message' in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (typeof message === 'object') return JSON.stringify(message);
  }
  if (typeof data === 'object' && data && 'error' in data && typeof (data as { error?: unknown }).error === 'string') {
    return (data as { error: string }).error;
  }
  return fallback;
}

function numericIds(values?: string[]): number[] | undefined {
  if (!values?.length) return undefined;
  const ids = values.map((v) => Number(v)).filter(Number.isInteger);
  return ids.length ? ids : undefined;
}

function mergeRequestState(state: string): PullRequest['state'] {
  if (state === 'merged') return 'merged';
  if (state === 'closed') return 'closed';
  return 'open';
}

function issueState(state: string): Issue['state'] {
  return state === 'closed' ? 'closed' : 'open';
}

function hookEvents(events: string[]): Record<string, boolean> {
  const normalized = new Set(events.map((e) => e.toLowerCase()));
  return {
    push_events: normalized.has('push'),
    merge_requests_events: normalized.has('merge_request') || normalized.has('merge_requests'),
    issues_events: normalized.has('issue') || normalized.has('issues'),
    tag_push_events: normalized.has('tag_push') || normalized.has('tag_pushes'),
    job_events: normalized.has('job') || normalized.has('jobs'),
    pipeline_events: normalized.has('pipeline') || normalized.has('pipelines'),
    releases_events: normalized.has('release') || normalized.has('releases'),
  };
}

function stubRelease(spec: { tag: string }, config: Config): Release {
  return {
    id: `gl_rel_${Date.now()}`,
    tag: spec.tag,
    url: releaseWebUrl(config, spec.tag),
    uploadedAssets: [],
  };
}

function stubPullRequest(config: Config): PullRequest {
  return {
    id: `gl_mr_${Date.now()}`,
    number: 1,
    state: 'open',
    url: `${baseUrl(config)}/${String(config.projectId)}/-/merge_requests/1`,
  };
}

function stubIssue(config: Config): Issue {
  return {
    id: `gl_iss_${Date.now()}`,
    number: 1,
    state: 'open',
    url: `${baseUrl(config)}/${String(config.projectId)}/-/issues/1`,
  };
}
