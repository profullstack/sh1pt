import { defineVcs, tokenSetup, type Release, type PullRequest, type Issue } from '@profullstack/sh1pt-core';

// GitHub REST (v3) + GraphQL (v4). Auth: classic PAT, fine-grained PAT,
// or GitHub App installation token. Installation tokens are preferred —
// scoped to the repo, auto-rotate, and don't tie to a user.
interface Config {
  owner: string;               // 'acme'
  repo: string;                // 'my-app'
  defaultBranch?: string;      // usually 'main'
  appInstallationId?: number;  // if using a GitHub App (optional)
}

const API = 'https://api.github.com';

interface GitHubReleaseResponse {
  id: number;
  tag_name: string;
  html_url: string;
}

interface GitHubPullResponse {
  id: number;
  number: number;
  html_url: string;
  state: 'open' | 'closed';
  merged?: boolean;
}

interface GitHubIssueResponse {
  id: number;
  number: number;
  html_url: string;
  state: 'open' | 'closed';
}

interface GitHubWebhookResponse {
  id: number;
}

export default defineVcs<Config>({
  id: 'vcs-github',
  label: 'GitHub',

  async connect(ctx, config) {
    if (!ctx.secret('GITHUB_TOKEN')) throw new Error('GITHUB_TOKEN not in vault — `sh1pt secret set GITHUB_TOKEN`');
    ctx.log(`github connected · ${config.owner}/${config.repo}`);
    return { accountId: `${config.owner}/${config.repo}` };
  },

  async createRelease(ctx, spec, config): Promise<Release> {
    ctx.log(`github release · ${config.owner}/${config.repo} · tag=${spec.tag}`);
    if (isOfflineToken(ctx)) return stubRelease(spec, config);

    const release = await githubRequest<GitHubReleaseResponse>(ctx, config, `/repos/${repoPath(config)}/releases`, {
      method: 'POST',
      body: {
        tag_name: spec.tag,
        name: spec.name ?? spec.tag,
        body: spec.body,
        target_commitish: spec.targetCommitish ?? config.defaultBranch,
        prerelease: spec.prerelease ?? false,
        draft: spec.draft ?? false,
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
    ctx.log(`github pr · ${spec.head} → ${spec.base}`);
    if (isOfflineToken(ctx)) return stubPullRequest(config);

    const pr = await githubRequest<GitHubPullResponse>(ctx, config, `/repos/${repoPath(config)}/pulls`, {
      method: 'POST',
      body: {
        title: spec.title,
        body: spec.body,
        head: spec.head,
        base: spec.base || config.defaultBranch || 'main',
        draft: spec.draft ?? false,
      },
    });

    if (spec.labels?.length) {
      await githubRequest(ctx, config, `/repos/${repoPath(config)}/issues/${pr.number}/labels`, {
        method: 'POST',
        body: { labels: spec.labels },
      });
    }

    if (spec.reviewers?.length) {
      await githubRequest(ctx, config, `/repos/${repoPath(config)}/pulls/${pr.number}/requested_reviewers`, {
        method: 'POST',
        body: { reviewers: spec.reviewers },
      });
    }

    return {
      id: String(pr.id),
      number: pr.number,
      state: pr.merged ? 'merged' : pr.state,
      url: pr.html_url,
    };
  },

  async createIssue(ctx, spec, config): Promise<Issue> {
    ctx.log(`github issue · "${spec.title}"`);
    if (isOfflineToken(ctx)) return stubIssue(config);

    const issue = await githubRequest<GitHubIssueResponse>(ctx, config, `/repos/${repoPath(config)}/issues`, {
      method: 'POST',
      body: {
        title: spec.title,
        body: spec.body,
        labels: spec.labels,
        assignees: spec.assignees,
      },
    });

    return {
      id: String(issue.id),
      number: issue.number,
      state: issue.state,
      url: issue.html_url,
    };
  },

  async createWebhook(ctx, spec, config) {
    ctx.log(`github webhook · ${spec.url} · events=${spec.events.join(',')}`);
    if (isOfflineToken(ctx)) return { id: `gh_hook_${Date.now()}` };

    const webhook = await githubRequest<GitHubWebhookResponse>(ctx, config, `/repos/${repoPath(config)}/hooks`, {
      method: 'POST',
      body: {
        name: 'web',
        active: true,
        events: spec.events,
        config: {
          url: spec.url,
          content_type: 'json',
          secret: spec.secret,
          insecure_ssl: '0',
        },
      },
    });

    return { id: String(webhook.id) };
  },

  setup: tokenSetup<Config>({
    secretKey: 'GITHUB_TOKEN',
    label: 'GitHub',
    vendorDocUrl: 'https://github.com/settings/tokens',
    steps: [
      'Install GitHub CLI (`gh`) from cli.github.com',
      'Authenticate locally: gh auth login',
      'Open https://github.com/settings/tokens → Generate new token (classic) or Fine-grained',
      'Scopes: repo (for releases, PRs, issues), workflow (if managing Actions)',
      'Or: create a GitHub App and use an installation token for repo-scoped, auto-rotating auth',
      'Copy the token (shown once) and paste when prompted',
    ],
    fields: [
      { key: 'owner', message: 'GitHub owner / org (e.g. "profullstack"):', required: true },
      { key: 'repo', message: 'Repo name (e.g. "sh1pt"):', required: true },
    ],
  }),
});

function repoPath(config: Config): string {
  return `${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
}

function isOfflineToken(ctx: { secret(k: string): string | undefined }): boolean {
  return ctx.secret('GITHUB_TOKEN') === 'test';
}

async function githubRequest<T = unknown>(
  ctx: { secret(k: string): string | undefined },
  config: Config,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = ctx.secret('GITHUB_TOKEN');
  if (!token) throw new Error('GITHUB_TOKEN not in vault');

  const response = await fetch(`${API}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const message = typeof data?.message === 'string' ? data.message : response.statusText;
    throw new Error(`GitHub ${options.method ?? 'GET'} ${config.owner}/${config.repo}${path} failed: ${response.status} ${message}`);
  }

  return data as T;
}

function stubRelease(spec: { tag: string }, config: Config): Release {
  return {
    id: `gh_rel_${Date.now()}`,
    tag: spec.tag,
    url: `https://github.com/${config.owner}/${config.repo}/releases/tag/${spec.tag}`,
    uploadedAssets: [],
  };
}

function stubPullRequest(config: Config): PullRequest {
  return {
    id: `gh_pr_${Date.now()}`,
    number: 1,
    state: 'open',
    url: `https://github.com/${config.owner}/${config.repo}/pull/1`,
  };
}

function stubIssue(config: Config): Issue {
  return {
    id: `gh_iss_${Date.now()}`,
    number: 1,
    state: 'open',
    url: `https://github.com/${config.owner}/${config.repo}/issues/1`,
  };
}
