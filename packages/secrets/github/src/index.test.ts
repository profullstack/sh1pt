import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execMock } = vi.hoisted(() => ({
  execMock: vi.fn(),
}));

vi.mock('@profullstack/sh1pt-core', async () => ({
  ...await vi.importActual<typeof import('@profullstack/sh1pt-core')>('@profullstack/sh1pt-core'),
  exec: execMock,
}));

import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'secrets' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GitHub secrets provider', () => {
  it('checks GitHub CLI authentication before reporting a connection', async () => {
    execMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

    await expect(adapter.connect({ secret: () => undefined, log: () => {} }, {
      repo: 'owner/repo',
    })).resolves.toEqual({ accountId: 'owner/repo' });

    expect(execMock).toHaveBeenCalledWith('gh', [
      'auth',
      'status',
    ], expect.objectContaining({ throwOnNonZero: true }));
  });

  it('lists GitHub secret metadata without attempting to read values', async () => {
    execMock.mockResolvedValue({
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify([
        { name: 'API_TOKEN', updatedAt: '2026-06-10T00:00:00Z', visibility: 'private' },
        { name: 'DEPLOY_KEY', numSelectedRepos: 2 },
      ]),
    });

    await expect(adapter.pull({ secret: () => undefined, log: () => {} }, {
      repo: 'owner/repo',
      app: 'actions',
    })).resolves.toEqual([
      { key: 'API_TOKEN', path: 'private · 2026-06-10T00:00:00Z' },
      { key: 'DEPLOY_KEY', path: '2 selected repos' },
    ]);

    expect(execMock).toHaveBeenCalledWith('gh', [
      'secret',
      'list',
      '--app',
      'actions',
      '--json',
      'name,updatedAt,visibility,selectedReposURL,numSelectedRepos',
      '--repo',
      'owner/repo',
    ], expect.objectContaining({ throwOnNonZero: true }));
  });

  it('reports invalid GitHub CLI list output with an actionable error', async () => {
    execMock.mockResolvedValue({
      exitCode: 0,
      stderr: '',
      stdout: 'warning: authentication needs attention\n[]',
    });

    await expect(adapter.pull({ secret: () => undefined, log: () => {} }, {
      repo: 'owner/repo',
    })).rejects.toThrow('Unable to parse `gh secret list --json` output as JSON');
  });

  it('sets repository environment secrets from provided values or the sh1pt vault', async () => {
    execMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    const logs: string[] = [];

    await expect(adapter.push({
      secret: (key) => key === 'FROM_VAULT' ? 'vault-value' : undefined,
      log: (message) => logs.push(message),
    }, [
      { key: 'DIRECT_VALUE', value: 'direct-value' },
      { key: 'FROM_VAULT' },
    ], {
      repo: 'owner/repo',
      environment: 'production',
    })).resolves.toEqual({ count: 2 });

    expect(execMock).toHaveBeenNthCalledWith(1, 'gh', [
      'secret',
      'set',
      '--app',
      'actions',
      '--repo',
      'owner/repo',
      '--env',
      'production',
      'DIRECT_VALUE',
      '--body',
      'direct-value',
    ], expect.objectContaining({ throwOnNonZero: true }));
    expect(execMock).toHaveBeenNthCalledWith(2, 'gh', [
      'secret',
      'set',
      '--app',
      'actions',
      '--repo',
      'owner/repo',
      '--env',
      'production',
      'FROM_VAULT',
      '--body',
      'vault-value',
    ], expect.objectContaining({ throwOnNonZero: true }));
    expect(logs.join('\n')).not.toContain('direct-value');
    expect(logs.join('\n')).not.toContain('vault-value');
  });

  it('supports organization visibility arguments', async () => {
    execMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

    await adapter.push({ secret: () => undefined, log: () => {} }, [
      { key: 'ORG_TOKEN', value: 'token' },
    ], {
      org: 'my-org',
      repos: ['repo-a', 'repo-b'],
    });

    expect(execMock).toHaveBeenCalledWith('gh', expect.arrayContaining([
      '--org',
      'my-org',
      '--repos',
      'repo-a,repo-b',
    ]), expect.any(Object));
  });

  it('rejects conflicting organization visibility and repository selection options', async () => {
    await expect(adapter.push({ secret: () => undefined, log: () => {} }, [
      { key: 'ORG_TOKEN', value: 'token' },
    ], {
      org: 'my-org',
      visibility: 'all',
      repos: ['repo-a'],
    })).rejects.toThrow('GitHub organization secrets cannot combine visibility with explicit repository selection');

    await expect(adapter.push({ secret: () => undefined, log: () => {} }, [
      { key: 'ORG_TOKEN', value: 'token' },
    ], {
      org: 'my-org',
      visibility: 'private',
      noReposSelected: true,
    })).rejects.toThrow('GitHub organization secrets cannot combine visibility with explicit repository selection');

    expect(execMock).not.toHaveBeenCalled();
  });

  it('supports repository restrictions for user secrets', async () => {
    execMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

    await adapter.push({ secret: () => undefined, log: () => {} }, [
      { key: 'USER_TOKEN', value: 'token' },
    ], {
      user: true,
      repos: ['owner/repo'],
    });

    expect(execMock).toHaveBeenCalledWith('gh', expect.arrayContaining([
      '--app',
      'codespaces',
      '--user',
      '--repos',
      'owner/repo',
    ]), expect.any(Object));
  });

  it('rejects organization-only visibility options for user secrets', async () => {
    await expect(adapter.push({ secret: () => undefined, log: () => {} }, [
      { key: 'USER_TOKEN', value: 'token' },
    ], {
      user: true,
      noReposSelected: true,
    })).rejects.toThrow('GitHub user secrets do not support noReposSelected');

    expect(execMock).not.toHaveBeenCalled();
  });

  it('rejects non-Codespaces apps for user secrets', async () => {
    await expect(adapter.pull({ secret: () => undefined, log: () => {} }, {
      user: true,
      app: 'actions',
    })).rejects.toThrow('GitHub user secrets only support the Codespaces app');

    expect(execMock).not.toHaveBeenCalled();
  });

  it('rejects mutually exclusive target scopes before calling gh', async () => {
    await expect(adapter.pull({ secret: () => undefined, log: () => {} }, {
      user: true,
      repo: 'owner/repo',
    })).rejects.toThrow('GitHub user secrets cannot be combined with repository, environment, or organization scope');

    await expect(adapter.push({ secret: () => undefined, log: () => {} }, [
      { key: 'ORG_TOKEN', value: 'token' },
    ], {
      org: 'my-org',
      environment: 'production',
    })).rejects.toThrow('GitHub organization secrets cannot be combined with repository or environment scope');

    expect(execMock).not.toHaveBeenCalled();
  });
});
