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
  if (config.user) {
    if (config.app && config.app !== 'codespaces') {
      throw new Error('GitHub user secrets only support the Codespaces app');
    }
    return 'codespaces';
  }
  return config.app ?? 'actions';
}

function targetArgs(config: Config): string[] {
  const args: string[] = [];
  const repo = text(config.repo);
  const environment = text(config.environment);
  const org = text(config.org);

  if (config.user && (repo || environment || org)) {
    throw new Error('GitHub user secrets cannot be combined with repository, environment, or organization scope');
  }
  if (org && (repo || environment)) {
    throw new Error('GitHub organization secrets cannot be combined with repository or environment scope');
  }

  if (repo) args.push('--repo', repo);
  if (environment) args.push('--env', environment);
  if (org) args.push('--org', org);
  if (config.user) args.push('--user');

  return args;
}

function scopeVisibilityArgs(config: Config): string[] {
  if (!text(config.org) && !config.user) return [];

  if (config.user) {
    if (config.noReposSelected) {
      throw new Error('GitHub user secrets do not support noReposSelected; omit it or use repos to restrict access');
    }
    if (config.visibility) {
      throw new Error('GitHub user secrets do not support visibility; use repos to restrict Codespaces access');
    }
    if (config.repos?.length) return ['--repos', config.repos.join(',')];
    return [];
  }

  if (config.visibility && (config.noReposSelected || config.repos?.length)) {
    throw new Error('GitHub organization secrets cannot combine visibility with explicit repository selection');
  }
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error('Unable to parse `gh secret list --json` output as JSON. Run `gh auth status` and retry.', {
      cause: error,
    });
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Expected `gh secret list --json` to return a JSON array.');
  }
  const entries = parsed as GitHubSecretListEntry[];
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
    await exec('gh', ['auth', 'status'], { log: (message) => ctx.log(message), throwOnNonZero: true });
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
    const commonArgs = ['secret', 'set', '--app', app(config), ...targetArgs(config), ...scopeVisibilityArgs(config)];
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
