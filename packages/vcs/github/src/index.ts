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
    // TODO: POST /repos/:owner/:repo/releases with { tag_name, name, body, draft, prerelease, target_commitish }
    // then POST /repos/:owner/:repo/releases/:id/assets for each asset (signed upload URL).
    return {
      id: `gh_rel_${Date.now()}`,
      tag: spec.tag,
      url: `https://github.com/${config.owner}/${config.repo}/releases/tag/${spec.tag}`,
      uploadedAssets: [],
    };
  },

  async createPullRequest(ctx, spec, config): Promise<PullRequest> {
    ctx.log(`github pr · ${spec.head} → ${spec.base}`);
    // TODO: POST /repos/:owner/:repo/pulls with { title, body, head, base, draft }
    // If spec.labels / spec.reviewers: POST /repos/:owner/:repo/issues/:n/labels and /pulls/:n/requested_reviewers
    return {
      id: `gh_pr_${Date.now()}`, number: 1, state: 'open',
      url: `https://github.com/${config.owner}/${config.repo}/pull/1`,
    };
  },

  async createIssue(ctx, spec, config): Promise<Issue> {
    ctx.log(`github issue · "${spec.title}"`);
    // TODO: POST /repos/:owner/:repo/issues
    return {
      id: `gh_iss_${Date.now()}`, number: 1, state: 'open',
      url: `https://github.com/${config.owner}/${config.repo}/issues/1`,
    };
  },

  async createWebhook(ctx, spec, config) {
    ctx.log(`github webhook · ${spec.url} · events=${spec.events.join(',')}`);
    // TODO: POST /repos/:owner/:repo/hooks with { config: { url, content_type: 'json', secret }, events }
    return { id: `gh_hook_${Date.now()}` };
  },

  setup: tokenSetup<Config>({
    secretKey: 'GITHUB_TOKEN',
    label: 'GitHub',
    vendorDocUrl: 'https://github.com/settings/tokens',
    steps: [
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
