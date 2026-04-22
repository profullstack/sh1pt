import { defineVcs, tokenSetup, type Release, type PullRequest, type Issue } from '@profullstack/sh1pt-core';

// Gitea / Forgejo / Codeberg — GitHub-compatible REST at /api/v1/*.
// Self-hosted is the common case; host is required.
interface Config {
  host: string;                 // e.g. 'gitea.yourco.com' or 'codeberg.org'
  owner: string;
  repo: string;
  defaultBranch?: string;
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
    // TODO: POST https://${host}/api/v1/repos/:owner/:repo/releases
    return {
      id: `gt_rel_${Date.now()}`,
      tag: spec.tag,
      url: `https://${config.host}/${config.owner}/${config.repo}/releases/tag/${spec.tag}`,
      uploadedAssets: [],
    };
  },

  async createPullRequest(ctx, spec, config): Promise<PullRequest> {
    ctx.log(`gitea pr · ${spec.head} → ${spec.base}`);
    // TODO: POST /api/v1/repos/:owner/:repo/pulls
    return {
      id: `gt_pr_${Date.now()}`, number: 1, state: 'open',
      url: `https://${config.host}/${config.owner}/${config.repo}/pulls/1`,
    };
  },

  async createIssue(ctx, spec, config): Promise<Issue> {
    return {
      id: `gt_iss_${Date.now()}`, number: 1, state: 'open',
      url: `https://${config.host}/${config.owner}/${config.repo}/issues/1`,
    };
  },

  async createWebhook(ctx, spec, config) {
    ctx.log(`gitea webhook · ${spec.url}`);
    return { id: `gt_hook_${Date.now()}` };
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
