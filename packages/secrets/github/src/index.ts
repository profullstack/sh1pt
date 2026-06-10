import { defineSecretProvider, exec, manualSetup, type SecretRef } from '@profullstack/sh1pt-core';

type GitHubSecretApp = 'actions' | 'agents' | 'codespaces' | 'dependabot';
type GitHubSecretVisibility = 'all' | 'private' | 'selected';

interface Config {
  app?: GitHubSecretApp;
  repo?: string;
  environment?: string;
  org?: string;
  user?: boolean;
  visibility?: GitHubSecretVisibility;
  repos?: string[];
  noReposSelected?: boolean;
}

interface GitHubSecretListEntry {
  name: string;
  updatedAt?: string;
  visibility?: string;
  selectedReposURL?: string;
  numSelectedRepos?: number;
}

function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function app(config: Config): GitHubSecretApp {
  return config.app ?? 'actions';
}

function targetArgs(config: Config): string[] {
  const args: string[] = [];
  const repo = text(config.repo);
  const environment = text(config.environment);
  const org = text(config.org);

  if (repo) args.push('--repo', repo);
  if (environment) args.push('--env', environment);
  if (org) args.push('--org', org);
  if (config.user) args.push('--user');

  return args;
}

function orgVisibilityArgs(config: Config): string[] {
  if (!text(config.org) && !config.user) return [];
  if (config.noReposSelected) return ['--no-repos-selected'];
  if (config.repos?.length) return ['--repos', config.repos.join(',')];
  if (config.visibility) return ['--visibility', config.visibility];
  return [];
}

function assertSecretKey(key: string): string {
  const normalized = key.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    throw new Error(`GitHub secret key must be an environment-style name: ${key}`);
  }
  return normalized;
}

function parseSecretList(stdout: string): SecretRef[] {
  const body = stdout.trim();
  if (!body) return [];
  const entries = JSON.parse(body) as GitHubSecretListEntry[];
  return entries.map((entry) => ({
    key: entry.name,
    path: [
      entry.visibility,
      entry.numSelectedRepos !== undefined ? `${entry.numSelectedRepos} selected repos` : undefined,
      entry.updatedAt,
    ].filter(Boolean).join(' · ') || undefined,
  }));
}

export default defineSecretProvider<Config>({
  id: 'secrets-github',
  label: 'GitHub Secrets',
  cli: 'gh',
  async connect(ctx, config) {
    const scope = text(config.repo) ?? text(config.org) ?? (config.user ? 'user' : 'current repository');
    ctx.log(`gh auth status · scope=${scope}`);
    return { accountId: scope };
  },
  async pull(ctx, config): Promise<SecretRef[]> {
    const args = [
      'secret',
      'list',
      '--app',
      app(config),
      '--json',
      'name,updatedAt,visibility,selectedReposURL,numSelectedRepos',
      ...targetArgs(config),
    ];
    ctx.log(`gh ${args.join(' ')}`);
    const result = await exec('gh', args, { log: (message) => ctx.log(message), throwOnNonZero: true });
    return parseSecretList(result.stdout);
  },
  async push(ctx, secrets, config) {
    const commonArgs = ['secret', 'set', '--app', app(config), ...targetArgs(config), ...orgVisibilityArgs(config)];
    for (const secret of secrets) {
      const key = assertSecretKey(secret.key);
      const value = secret.value ?? ctx.secret(key);
      if (value === undefined) {
        throw new Error(`No value provided for GitHub secret ${key}`);
      }
      ctx.log(`gh ${commonArgs.join(' ')} ${key} --body <redacted>`);
      await exec('gh', [...commonArgs, key, '--body', value], {
        log: (message) => ctx.log(message),
        throwOnNonZero: true,
      });
    }
    return { count: secrets.length };
  },
  setup: manualSetup({
    label: 'GitHub CLI',
    vendorDocUrl: 'https://cli.github.com/manual/gh_secret',
    steps: [
      'Install GitHub CLI from the official docs',
      'Authenticate with a token that can manage the target secret scope: gh auth login',
      'For repository secrets, configure repo: owner/name',
      'For environment secrets, configure repo plus environment',
    ],
  }),
});
