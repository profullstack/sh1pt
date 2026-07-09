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

smokeTest(adapter, { idPrefix: 'pkg', requireKind: true });

const sampleConfig = {
  scope: 'acme',
  packageName: 'my-lib',
  packageDir: 'packages/my-lib',
};

describe('pkg-jsr target adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs JSR publish dry-run during build', async () => {
    execMock.mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

    const ctx = context();
    const result = await adapter.build(ctx as any, sampleConfig);

    expect(execMock).toHaveBeenCalledWith('npx', ['--yes', 'jsr', 'publish', '--dry-run'], {
      cwd: '/repo/packages/my-lib',
      log: ctx.log,
      env: ctx.env,
      throwOnNonZero: true,
    });
    expect(result).toEqual({ artifact: '/repo/packages/my-lib' });
  });

  it('does not require JSR_TOKEN in dry-run ship mode', async () => {
    const result = await adapter.ship(shipContext({ dryRun: true }) as any, sampleConfig);

    expect(result).toEqual({ id: 'dry-run' });
    expect(execMock).not.toHaveBeenCalled();
  });

  it('rejects invalid JSR package config before publish work', async () => {
    await expect(adapter.ship(shipContext({ dryRun: true }) as any, {
      ...sampleConfig,
      scope: 'BadScope',
    })).rejects.toThrow('scope must be lowercase letters');

    await expect(adapter.ship(shipContext({ dryRun: true }) as any, {
      ...sampleConfig,
      packageName: 'bad_name',
    })).rejects.toThrow('packageName must be lowercase letters');

    await expect(adapter.ship(shipContext({ dryRun: true }) as any, {
      ...sampleConfig,
      packageDir: '   ',
    })).rejects.toThrow('pkg-jsr requires packageDir');

    expect(execMock).not.toHaveBeenCalled();
  });

  it('requires JSR_TOKEN before publishing', async () => {
    await expect(adapter.ship(shipContext({ dryRun: false }) as any, sampleConfig))
      .rejects.toThrow('JSR_TOKEN secret not set');
  });

  it('publishes with the JSR token and returns package metadata', async () => {
    execMock.mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

    const ctx = shipContext({ dryRun: false, secrets: { JSR_TOKEN: 'jsr-token' } });
    const result = await adapter.ship(ctx as any, sampleConfig);

    expect(execMock).toHaveBeenCalledWith('npx', ['--yes', 'jsr', 'publish', '--token', 'jsr-token'], {
      cwd: '/repo/packages/my-lib',
      log: ctx.log,
      env: { ...ctx.env, JSR_TOKEN: 'jsr-token' },
      throwOnNonZero: true,
    });
    expect(result).toEqual({
      id: '@acme/my-lib@1.2.3',
      url: 'https://jsr.io/@acme/my-lib',
    });
  });
});

function context({ secrets = {} }: { secrets?: Record<string, string> } = {}) {
  return {
    projectDir: '/repo',
    outDir: '/repo/.sh1pt/out',
    version: '1.2.3',
    channel: 'stable',
    env: { CI: 'true' },
    secret: (key: string) => secrets[key],
    log: vi.fn(),
  };
}

function shipContext({ dryRun, secrets }: { dryRun: boolean; secrets?: Record<string, string> }) {
  return {
    ...context({ secrets }),
    artifact: '/repo/packages/my-lib',
    dryRun,
  };
}
