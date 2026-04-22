import { autoSetup } from './setup-helpers.js';

// Version-control integration — GitHub / GitLab / Gitea. Cross-cutting
// plumbing every verb touches: `promote ship` tags releases, `iterate`
// opens PRs with the agent's diff, `scale rollout` diffs versions,
// `promote outreach launch` can auto-link the repo in submissions.
//
// This is a thin layer over per-provider REST/GraphQL APIs, not a
// replacement for the local `git` CLI. git stays the source of truth;
// VcsProvider handles remote-side operations the CLI can't do alone.

export interface ReleaseSpec {
  tag: string;                  // e.g. 'v0.7.0'
  name?: string;                // defaults to tag
  body?: string;                // markdown release notes
  targetCommitish?: string;     // branch or SHA
  prerelease?: boolean;
  draft?: boolean;
  assets?: { path: string; label?: string; contentType?: string }[];
}

export interface Release {
  id: string;                   // provider-native id
  tag: string;
  url: string;
  uploadedAssets: { url: string; name: string }[];
}

export interface PullRequestSpec {
  title: string;
  body?: string;
  head: string;                 // branch to merge FROM (e.g. 'iterate/auto-fix-abc123')
  base: string;                 // branch to merge INTO (default: 'main')
  draft?: boolean;
  labels?: string[];
  reviewers?: string[];
}

export interface PullRequest {
  id: string;
  number: number;
  url: string;
  state: 'open' | 'merged' | 'closed';
}

export interface IssueSpec {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

export interface Issue {
  id: string;
  number: number;
  url: string;
  state: 'open' | 'closed';
}

export interface WebhookSpec {
  url: string;
  events: string[];             // provider-native event names
  secret?: string;              // HMAC secret for payload verification
}

export interface VcsProvider<Config = unknown> {
  id: string;                   // e.g. 'vcs-github'
  label: string;
  // Auth. Tokens live in the vault — GITHUB_TOKEN / GITLAB_TOKEN / etc.
  connect(ctx: { secret(k: string): string | undefined; log(m: string): void }, config: Config): Promise<{ accountId: string }>;

  // Release management — called by `sh1pt promote ship` on stable channel
  createRelease(ctx: { secret(k: string): string | undefined; log(m: string): void }, spec: ReleaseSpec, config: Config): Promise<Release>;

  // Collaboration — called by `sh1pt iterate run` when an agent produces a diff,
  // or by any subcommand that wants to file a tracked change.
  createPullRequest(ctx: { secret(k: string): string | undefined; log(m: string): void }, spec: PullRequestSpec, config: Config): Promise<PullRequest>;
  createIssue(ctx: { secret(k: string): string | undefined; log(m: string): void }, spec: IssueSpec, config: Config): Promise<Issue>;

  // Webhooks — called by `sh1pt config webhooks` to wire vendor → sh1pt cloud
  createWebhook(ctx: { secret(k: string): string | undefined; log(m: string): void }, spec: WebhookSpec, config: Config): Promise<{ id: string }>;
  setup?(ctx: import('./setup.js').SetupContext): Promise<import('./setup.js').SetupResult<Config>>;
}

export function defineVcs<Config>(v: VcsProvider<Config>): VcsProvider<Config> {
  return autoSetup(v);
}

const vcsRegistry = new Map<string, VcsProvider<any>>();

export function registerVcsProvider(v: VcsProvider<any>): void {
  if (vcsRegistry.has(v.id)) throw new Error(`VCS provider already registered: ${v.id}`);
  vcsRegistry.set(v.id, v);
}

export function getVcsProvider(id: string): VcsProvider<any> | undefined {
  return vcsRegistry.get(id);
}

export function listVcsProviders(): VcsProvider<any>[] {
  return [...vcsRegistry.values()];
}
