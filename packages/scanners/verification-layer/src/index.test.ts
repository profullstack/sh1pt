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

describe('verification-layer scanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('verifies the CLI on connect and reports a local account', async () => {
    execMock.mockResolvedValueOnce({ exitCode: 0, stdout: '0.25.3\n', stderr: '' });
    await expect(adapter.connect(ctx() as any, {})).resolves.toEqual({ accountId: 'verification-layer-local' });
    expect(execMock).toHaveBeenCalledWith('vlayer', ['--version'], expect.objectContaining({ throwOnNonZero: true }));
  });

  it('runs a scan with baseline/categories and maps HIPAA violations', async () => {
    execMock.mockResolvedValueOnce({
      exitCode: 1,
      stdout: JSON.stringify({
        violations: [
          { ruleId: 'PHI-001', severity: 'critical', title: 'Unencrypted PHI at rest', category: 'encryption', file: 'src/db.ts', line: 42 },
          { ruleId: 'AUD-010', severity: 'low', title: 'Missing audit log', category: 'audit', file: 'src/api.ts', line: 7 },
        ],
      }),
      stderr: '',
    });

    const result = await adapter.scan(ctx() as any, { path: 'src', kind: 'code' }, {
      baseline: '.vlayer-baseline.json',
      categories: ['phi', 'encryption'],
      severityThreshold: 'high',
    });

    expect(execMock).toHaveBeenCalledWith(
      'vlayer',
      ['scan', 'src', '--format', 'json', '--baseline=.vlayer-baseline.json', '--categories=phi,encryption'],
      expect.objectContaining({ throwOnNonZero: false }),
    );
    expect(result.findings).toEqual([
      { id: 'PHI-001', severity: 'critical', title: 'Unencrypted PHI at rest', packageName: 'encryption', path: 'src/db.ts:42' },
    ]);
  });

  it('throws on operational failures (exit > 1)', async () => {
    execMock.mockResolvedValueOnce({ exitCode: 2, stdout: '', stderr: 'invalid config' });
    await expect(adapter.scan(ctx() as any, { path: '.', kind: 'code' }, {})).rejects.toThrow('verification-layer scan failed (2): invalid config');
  });
});

function ctx() {
  return {
    env: {},
    secret: () => undefined,
    log: vi.fn(),
  };
}
