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

describe('ThreatCrush scanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('verifies the CLI on connect and reports a local account', async () => {
    execMock.mockResolvedValueOnce({ exitCode: 0, stdout: '0.2.2\n', stderr: '' });
    await expect(adapter.connect(ctx() as any, {})).resolves.toEqual({ accountId: 'threatcrush-local' });
    expect(execMock).toHaveBeenCalledWith('threatcrush', ['--version'], expect.objectContaining({ throwOnNonZero: true }));
  });

  it('runs a scan and maps the RunResult findings shape', async () => {
    execMock.mockResolvedValueOnce({
      exitCode: 1,
      stdout: JSON.stringify({
        type: 'scan',
        target: './src',
        findings: [
          { type: 'AWS Access Key', severity: 'critical', message: 'Hardcoded AWS key', location: 'src/config.ts:12', details: { file: 'src/config.ts', line: 12 } },
          { type: 'Bearer Token', severity: 'medium', message: 'Bearer token in source', location: 'src/api.ts:88' },
        ],
        severity_summary: { critical: 1, high: 0, medium: 1, low: 0, info: 0 },
        summary: '2 issue(s)',
      }),
      stderr: '',
    });

    const result = await adapter.scan(ctx() as any, { path: './src', kind: 'code' }, { severityThreshold: 'high' });

    expect(execMock).toHaveBeenCalledWith('threatcrush', ['scan', './src', '--json'], expect.objectContaining({ throwOnNonZero: false }));
    expect(result.findings).toEqual([
      { id: 'AWS Access Key', severity: 'critical', title: 'AWS Access Key', packageName: undefined, path: 'src/config.ts:12' },
    ]);
  });

  it('throws on operational failures (exit > 1)', async () => {
    execMock.mockResolvedValueOnce({ exitCode: 2, stdout: '', stderr: 'permission denied' });
    await expect(adapter.scan(ctx() as any, { path: '.', kind: 'code' }, {})).rejects.toThrow('threatcrush scan failed (2): permission denied');
  });
});

function ctx() {
  return {
    env: {},
    secret: () => undefined,
    log: vi.fn(),
  };
}
