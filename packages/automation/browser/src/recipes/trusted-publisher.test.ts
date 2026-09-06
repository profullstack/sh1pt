import { describe, expect, it } from 'vitest';
import * as pypi from './pypi-trusted-publisher.js';
import * as rubygems from './rubygems-trusted-publisher.js';
import { RECIPES } from '../index.js';
import { parse, profileFor } from '../run.js';

const pypiPublisher: pypi.GitHubPublisher = {
  projectName: 'profullstack-x402-gateway',
  owner: 'profullstack',
  repository: 'x402-ports',
  workflowFilename: 'release-python.yml',
};

const gemPublisher: rubygems.GitHubPublisher = {
  gemName: 'x402-gateway',
  owner: 'profullstack',
  repository: 'x402-ports',
  workflowFilename: 'release-ruby.yml',
};

describe('alreadyRegistered', () => {
  it('recognises a row that names the project, repo and workflow', () => {
    const rows = ['profullstack-x402-gateway profullstack / x402-ports release-python.yml'];
    expect(pypi.alreadyRegistered(rows, pypiPublisher)).toBe(true);
  });

  it('ignores case and surrounding text', () => {
    const rows = ['Pending publisher: PROFULLSTACK-X402-GATEWAY — Profullstack/X402-Ports — Release-Python.yml — edit'];
    expect(pypi.alreadyRegistered(rows, pypiPublisher)).toBe(true);
  });

  it('does not match a different workflow in the same repo', () => {
    const rows = ['profullstack-x402-gateway profullstack / x402-ports release-ruby.yml'];
    expect(pypi.alreadyRegistered(rows, pypiPublisher)).toBe(false);
  });

  it('does not match the same workflow for a different project', () => {
    const rows = ['coinpay profullstack / x402-ports release-python.yml'];
    expect(pypi.alreadyRegistered(rows, pypiPublisher)).toBe(false);
  });

  it('treats an empty list as nothing registered', () => {
    expect(pypi.alreadyRegistered([], pypiPublisher)).toBe(false);
    expect(rubygems.alreadyRegistered([], gemPublisher)).toBe(false);
  });

  it('works the same way for gems', () => {
    const rows = ['x402-gateway | profullstack | x402-ports | release-ruby.yml | GitHub Actions'];
    expect(rubygems.alreadyRegistered(rows, gemPublisher)).toBe(true);
    expect(rubygems.alreadyRegistered(rows, { ...gemPublisher, gemName: 'coinpay' })).toBe(false);
  });
});

describe('the recipe registry', () => {
  it('gives every trusted-publisher recipe its own profile', () => {
    const pypiEntry = RECIPES.find((r) => r.id === 'pypi-trusted-publisher');
    const gemEntry = RECIPES.find((r) => r.id === 'rubygems-trusted-publisher');
    expect(pypiEntry?.profile).toBe('pypi');
    expect(gemEntry?.profile).toBe('rubygems');
    // A shared profile would sign one registry out when the other signs in —
    // but that is a fact about distinct identity providers, not about recipes.
    // Recipes that talk to the SAME provider (the Google Cloud console and the
    // Chrome Web Store console are both signed in as one Google account) should
    // share, or the second one forces a redundant sign-in to the same place.
    // So: no profile may be shared by two different providers.
    const PROVIDER_FAMILIES: Record<string, string[]> = {
      google: ['google-cloud-oauth', 'chrome-web-store'],
    };
    const owners = new Map<string, Set<string>>();
    for (const recipe of RECIPES) {
      const family =
        Object.entries(PROVIDER_FAMILIES).find(([, ids]) => ids.includes(recipe.id))?.[0] ?? recipe.id;
      const seen = owners.get(recipe.profile) ?? new Set<string>();
      seen.add(family);
      owners.set(recipe.profile, seen);
    }
    for (const [profile, families] of owners) {
      expect(`${profile}: ${[...families].join(', ')}`).toBe(`${profile}: ${[...families][0]}`);
    }
  });

  it('lists both actions on each', () => {
    for (const id of ['pypi-trusted-publisher', 'rubygems-trusted-publisher']) {
      expect(RECIPES.find((r) => r.id === id)?.actions).toEqual(['list', 'add-pending']);
    }
  });

  it('resolves the profile a recipe runs under', () => {
    expect(profileFor('pypi-trusted-publisher')).toBe('pypi');
    expect(profileFor('rubygems-trusted-publisher')).toBe('rubygems');
    expect(profileFor('not-a-recipe')).toBe('not-a-recipe');
  });
});

describe('flag parsing', () => {
  it('reads a whole add-pending invocation', () => {
    const { recipe, action, options } = parse([
      'pypi-trusted-publisher',
      'add-pending',
      '--package',
      'profullstack-x402-gateway',
      '--owner',
      'profullstack',
      '--repo',
      'x402-ports',
      '--workflow',
      'release-python.yml',
    ]);
    expect(recipe).toBe('pypi-trusted-publisher');
    expect(action).toBe('add-pending');
    expect(options.packageName).toBe('profullstack-x402-gateway');
    expect(options.owner).toBe('profullstack');
    expect(options.repo).toBe('x402-ports');
    expect(options.workflow).toBe('release-python.yml');
    expect(options.environment).toBeUndefined();
  });

  it('still parses the google flags it started with', () => {
    const { options } = parse(['google-cloud-oauth', 'add-test-users', '--project', '123', '--email', 'a@b.com']);
    expect(options.project).toBe('123');
    expect(options.emails).toEqual(['a@b.com']);
  });
});
