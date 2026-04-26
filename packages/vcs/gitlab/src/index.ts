import { defineVcs, tokenSetup, type Release, type PullRequest, type Issue } from '@profullstack/sh1pt-core';

// GitLab REST API v4 — works for both gitlab.com and self-hosted.
// "Pull request" is called "Merge Request" here; the adapter exposes
// it as createPullRequest() to stay interface-consistent.
interface Config {
  host?: string;               // 'gitlab.com' or self-hosted host
  projectId: number | string;  // numeric id or 'group/project' path
  defaultBranch?: string;
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
    const host = config.host ?? 'gitlab.com';
    ctx.log(`gitlab release · project=${config.projectId} · tag=${spec.tag}`);
    // TODO: POST https://${host}/api/v4/projects/:id/releases
    return {
      id: `gl_rel_${Date.now()}`,
      tag: spec.tag,
      url: `https://${host}/${config.projectId}/-/releases/${spec.tag}`,
      uploadedAssets: [],
    };
  },

  async createPullRequest(ctx, spec, config): Promise<PullRequest> {
    const host = config.host ?? 'gitlab.com';
    ctx.log(`gitlab MR · ${spec.head} → ${spec.base}`);
    // TODO: POST /projects/:id/merge_requests with { source_branch, target_branch, title, description, draft }
    return {
      id: `gl_mr_${Date.now()}`, number: 1, state: 'open',
      url: `https://${host}/${config.projectId}/-/merge_requests/1`,
    };
  },

  async createIssue(ctx, spec, config): Promise<Issue> {
    const host = config.host ?? 'gitlab.com';
    ctx.log(`gitlab issue · "${spec.title}"`);
    // TODO: POST /projects/:id/issues
    return {
      id: `gl_iss_${Date.now()}`, number: 1, state: 'open',
      url: `https://${host}/${config.projectId}/-/issues/1`,
    };
  },

  async createWebhook(ctx, spec, config) {
    ctx.log(`gitlab webhook · ${spec.url}`);
    // TODO: POST /projects/:id/hooks with { url, token, push_events, merge_requests_events, ... }
    return { id: `gl_hook_${Date.now()}` };
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
