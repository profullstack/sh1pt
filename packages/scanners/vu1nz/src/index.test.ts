import { beforeEach, describe, expect, it, vi } from 'vitest';
import { smokeTest } from '@profullstack/sh1pt-core/testing';

const { execMock } = vi.hoisted(() => ({
  execMock: vi.fn(),
}));

vi.mock('@profullstack/sh1pt-core', async () => ({
  ...await vi.importActual<typeof import('@profullstack/sh1pt-core')>('@profullstack/sh1pt-core'),
  exec: execMock,
}));

import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'scanner' });

describe('vu1nz scanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('verifies the CLI on connect and reports a local account', async () => {
    execMock.mockResolvedValueOnce({ exitCode: 0, stdout: '0.1.0\n', stderr: '' });
    await expect(adapter.connect(ctx({}) as any, {})).resolves.toEqual({ accountId: 'vu1nz-local' });
    expect(execMock).toHaveBeenCalledWith('vu1nz', ['--version'], expect.objectContaining({ throwOnNonZero: true }));
  });

  it('runs a scan, passes GITHUB_TOKEN via env, and maps findings', async () => {
    execMock.mockResolvedValueOnce({
      exitCode: 1,
      stdout: JSON.stringify({
        findings: [
          { id: 'VU1NZ-XSS-1', severity: 'high', title: 'Reflected XSS', url: 'https://target/search' },
          { id: 'VU1NZ-LOW-1', severity: 'low', title: 'Verbose error', url: 'https://target/api' },
        ],
      }),
      stderr: '',
    });

    const result = await adapter.scan(ctx({ GITHUB_TOKEN: 'gh-tok' }) as any, { path: 'https://target', kind: 'code' }, {
      mode: 'web',
      severityThreshold: 'medium',
    });

    expect(execMock).toHaveBeenCalledWith(
      'vu1nz',
      ['scan', 'https://target', '--json', '--mode=web'],
      expect.objectContaining({ env: expect.objectContaining({ GITHUB_TOKEN: 'gh-tok' }), throwOnNonZero: false }),
    );
    expect(result.findings).toEqual([
      { id: 'VU1NZ-XSS-1', severity: 'high', title: 'Reflected XSS', packageName: undefined, path: 'https://target/search' },
    ]);
  });

  it('throws on operational failures (exit > 1)', async () => {
    execMock.mockResolvedValueOnce({ exitCode: 2, stdout: '', stderr: 'ollama not reachable' });
    await expect(adapter.scan(ctx({}) as any, { path: '.', kind: 'code' }, {})).rejects.toThrow('vu1nz scan failed (2): ollama not reachable');
  });
});

function ctx(secrets: Record<string, string>) {
  return {
    env: {},
    secret: (key: string) => secrets[key],
    log: vi.fn(),
  };
}
