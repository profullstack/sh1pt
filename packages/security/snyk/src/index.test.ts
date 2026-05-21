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

smokeTest(adapter, { idPrefix: 'security' });

describe('Snyk security provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires SNYK_TOKEN before connect or scan', async () => {
    await expect(adapter.connect(ctx({}) as any, {})).rejects.toThrow('SNYK_TOKEN not in vault');
    await expect(adapter.scan(ctx({}) as any, { path: '.', kind: 'dependencies' }, {})).rejects.toThrow('SNYK_TOKEN not in vault');
    expect(execMock).not.toHaveBeenCalled();
  });

  it('checks the Snyk CLI without writing auth tokens to argv', async () => {
    execMock.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '1.1293.0\n',
      stderr: '',
    });

    await expect(adapter.connect(ctx({ SNYK_TOKEN: 'test-token' }) as any, {
      org: 'acme',
      apiBaseUrl: 'https://api.eu.snyk.io',
    })).resolves.toEqual({ accountId: 'acme' });

    expect(execMock).toHaveBeenCalledWith('snyk', ['--version'], {
      env: {
        SNYK_TOKEN: 'test-token',
        SNYK_API: 'https://api.eu.snyk.io',
        SNYK_CFG_ORG: 'acme',
        SNYK_DISABLE_ANALYTICS: '1',
      },
      log: expect.any(Function),
      throwOnNonZero: true,
    });
  });

  it('runs dependency scans and maps vulnerability JSON even when Snyk exits 1', async () => {
    execMock.mockResolvedValueOnce({
      exitCode: 1,
      stdout: JSON.stringify({
        vulnerabilities: [
          {
            id: 'SNYK-JS-LODASH-567746',
            severity: 'high',
            title: 'Prototype Pollution',
            packageName: 'lodash',
            from: ['demo@1.0.0', 'lodash@4.17.20'],
          },
        ],
      }),
      stderr: '',
    });

    const result = await adapter.scan(ctx({ SNYK_TOKEN: 'test-token' }) as any, {
      path: '/repo',
      kind: 'dependencies',
    }, {
      org: 'acme',
      severityThreshold: 'medium',
      policyPath: '.snyk',
      failOn: 'upgradable',
    });

    expect(execMock).toHaveBeenCalledWith('snyk', [
      'test',
      '/repo',
      '--json',
      '--org=acme',
      '--severity-threshold=medium',
      '--policy-path=.snyk',
      '--fail-on=upgradable',
    ], expect.objectContaining({ throwOnNonZero: false }));
    expect(result.findings).toEqual([
      {
        id: 'SNYK-JS-LODASH-567746',
        severity: 'high',
        title: 'Prototype Pollution',
        packageName: 'lodash',
        path: 'demo@1.0.0 > lodash@4.17.20',
      },
    ]);
  });

  it('runs container scans with Dockerfile context', async () => {
    execMock.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({
        vulnerabilities: [
          { id: 'SNYK-DEBIAN12-OPENSSL-1', severity: 'critical', title: 'OpenSSL overflow', packageName: 'openssl' },
        ],
      }),
      stderr: '',
    });

    const result = await adapter.scan(ctx({ SNYK_TOKEN: 'test-token' }) as any, {
      path: 'registry.example.com/app:latest',
      kind: 'container',
    }, {
      dockerfilePath: 'Dockerfile',
    });

    expect(execMock.mock.calls[0]?.[1]).toEqual([
      'container',
      'test',
      'registry.example.com/app:latest',
      '--json',
      '--file=Dockerfile',
    ]);
    expect(result.findings[0]).toMatchObject({
      id: 'SNYK-DEBIAN12-OPENSSL-1',
      severity: 'critical',
      packageName: 'openssl',
    });
  });

  it('maps IaC issue arrays', async () => {
    execMock.mockResolvedValueOnce({
      exitCode: 1,
      stdout: JSON.stringify({
        infrastructureAsCodeIssues: [
          {
            publicId: 'SNYK-CC-TF-1',
            severity: 'medium',
            title: 'S3 bucket allows public access',
            path: 'main.tf',
          },
        ],
      }),
      stderr: '',
    });

    await expect(adapter.scan(ctx({ SNYK_TOKEN: 'test-token' }) as any, {
      path: 'infra',
      kind: 'iac',
    }, {})).resolves.toEqual({
      findings: [
        {
          id: 'SNYK-CC-TF-1',
          severity: 'medium',
          title: 'S3 bucket allows public access',
          packageName: undefined,
          path: 'main.tf',
        },
      ],
    });
    expect(execMock.mock.calls[0]?.[1]).toEqual(['iac', 'test', 'infra', '--json']);
  });

  it('maps Snyk Code style results when present', async () => {
    execMock.mockResolvedValueOnce({
      exitCode: 1,
      stdout: JSON.stringify({
        runs: [
          {
            results: [
              {
                ruleId: 'javascript/NoHardcodedCredentials',
                level: 'warning',
                message: { text: 'Hardcoded credential' },
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: 'src/config.ts' },
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
      stderr: '',
    });

    const result = await adapter.scan(ctx({ SNYK_TOKEN: 'test-token' }) as any, {
      path: 'src',
      kind: 'code',
    }, {});

    expect(execMock.mock.calls[0]?.[1]).toEqual(['code', 'test', 'src', '--json']);
    expect(result.findings).toEqual([
      {
        id: 'javascript/NoHardcodedCredentials',
        severity: 'medium',
        title: 'Hardcoded credential',
        packageName: undefined,
        path: 'src/config.ts',
      },
    ]);
  });

  it('redacts the token from command output on operational failures', async () => {
    execMock.mockResolvedValueOnce({
      exitCode: 2,
      stdout: '',
      stderr: 'request failed with test-token',
    });

    await expect(adapter.scan(ctx({ SNYK_TOKEN: 'test-token' }) as any, {
      path: '.',
      kind: 'dependencies',
    }, {})).rejects.toThrow('request failed with <redacted>');
  });
});

function ctx(secrets: Record<string, string>) {
  return {
    env: {},
    secret: (key: string) => secrets[key],
    log: vi.fn(),
  };
}
