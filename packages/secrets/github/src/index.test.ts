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
      visibility: 'selected',
      repos: ['repo-a', 'repo-b'],
    });

    expect(execMock).toHaveBeenCalledWith('gh', expect.arrayContaining([
      '--org',
      'my-org',
      '--repos',
      'repo-a,repo-b',
    ]), expect.any(Object));
  });
});
