import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

  it('invokes scan with a path and no flags', async () => {
    // `threatcrush scan` accepts a path only; --json is rejected with
    // "unknown option '--json'" (only `harden` supports it).
    execMock.mockResolvedValueOnce({ exitCode: 0, stdout: 'No issues found.', stderr: '' });

    await adapter.scan(ctx() as any, { path: './src', kind: 'code' }, {});

    expect(execMock).toHaveBeenCalledWith('threatcrush', ['scan', './src'], expect.objectContaining({ throwOnNonZero: false }));
  });

  it('parses the CLI text output and resolves paths against the scan path', async () => {
    execMock.mockResolvedValueOnce({
      exitCode: 1,
      stdout: [
        '  Scan Results',
        '  ─────────────────────────────────────────',
        '  1 critical  1 high  1 medium  0 low',
        '',
        '   CRITICAL  AWS Access Key',
        '    File: config.ts:12',
        '    Info: Possible AWS Access Key detected',
        '    Code: ****************',
        '',
        '  [HIGH] Sensitive File',
        '    File: secrets.env:0',
        '    Info: .env file found — may contain secrets',
        '',
        '  [MEDIUM] Hex Token (32+)',
        '    File: api.ts:88',
        '    Info: Possible Hex Token (32+) detected',
      ].join('\n'),
      stderr: '',
    });

    const result = await adapter.scan(ctx() as any, { path: './src', kind: 'code' }, {});

    expect(result.findings).toEqual([
      { id: 'AWS Access Key', severity: 'critical', title: 'AWS Access Key', packageName: undefined, path: 'src/config.ts:12' },
      // Line 0 means a whole-file finding, so no line suffix is emitted.
      { id: 'Sensitive File', severity: 'high', title: 'Sensitive File', packageName: undefined, path: 'src/secrets.env' },
      { id: 'Hex Token (32+)', severity: 'medium', title: 'Hex Token (32+)', packageName: undefined, path: 'src/api.ts:88' },
    ]);
  });

  it('applies the severity threshold to text findings', async () => {
    execMock.mockResolvedValueOnce({
      exitCode: 1,
      stdout: [
        '   CRITICAL  AWS Access Key',
        '    File: config.ts:12',
        '  [MEDIUM] Hex Token (32+)',
        '    File: api.ts:88',
      ].join('\n'),
      stderr: '',
    });

    const result = await adapter.scan(ctx() as any, { path: './src', kind: 'code' }, { severityThreshold: 'high' });

    expect(result.findings).toEqual([
      { id: 'AWS Access Key', severity: 'critical', title: 'AWS Access Key', packageName: undefined, path: 'src/config.ts:12' },
    ]);
  });

  it('ignores ANSI colour codes without eating severity labels', async () => {
    execMock.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '\u001b[31m  [HIGH] Database URL\u001b[0m\n    File: db.ts:4\n',
      stderr: '',
    });

    const result = await adapter.scan(ctx() as any, { path: '.', kind: 'code' }, {});

    expect(result.findings).toEqual([
      { id: 'Database URL', severity: 'high', title: 'Database URL', packageName: undefined, path: 'db.ts:4' },
    ]);
  });

  it('still maps JSON output if scan gains a machine-readable mode', async () => {
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

    expect(result.findings).toEqual([
      { id: 'AWS Access Key', severity: 'critical', title: 'AWS Access Key', packageName: undefined, path: 'src/config.ts:12' },
    ]);
  });

  it('returns no findings for a clean scan', async () => {
    execMock.mockResolvedValueOnce({ exitCode: 0, stdout: '✔ Scanned 30 files\n  No issues found.\n', stderr: '' });

    const result = await adapter.scan(ctx() as any, { path: '.', kind: 'code' }, {});

    expect(result.findings).toEqual([]);
  });

  // Captured verbatim from a live `threatcrush scan` run, so the parser is
  // tested against observed behaviour rather than an assumption about it.
  it('parses output captured from a real scan', async () => {
    const fixture = fileURLToPath(new URL('../test/scan-output.txt', import.meta.url));
    execMock.mockResolvedValueOnce({ exitCode: 1, stdout: readFileSync(fixture, 'utf8'), stderr: '' });

    const result = await adapter.scan(ctx() as any, { path: 'vulns', kind: 'code' }, {});

    expect(result.findings).toHaveLength(9);
    expect(result.findings.every((f) => f.path?.startsWith('vulns/'))).toBe(true);
    expect(result.findings[0]).toEqual({
      id: 'AWS Access Key',
      severity: 'critical',
      title: 'AWS Access Key',
      packageName: undefined,
      path: 'vulns/secrets/aws-credentials-hardcoded.env:23',
    });
    // The ".env file found" finding is reported at line 0 (whole file).
    expect(result.findings.map((f) => f.path)).toContain('vulns/secrets/aws-credentials-hardcoded.env');
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
