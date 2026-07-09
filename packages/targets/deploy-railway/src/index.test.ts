import { fakeShipContext, makeVault, smokeTest } from '@profullstack/sh1pt-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execMock } = vi.hoisted(() => ({
  execMock: vi.fn(),
}));

vi.mock('@profullstack/sh1pt-core', async () => ({
  ...await vi.importActual<typeof import('@profullstack/sh1pt-core')>('@profullstack/sh1pt-core'),
  exec: execMock,
}));

import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'deploy', requireKind: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Railway deployment target', () => {
  it('keeps dry-run shipping side-effect free while validating config', async () => {
    await expect(adapter.ship(fakeShipContext({
      channel: 'beta',
      dryRun: true,
    }) as any, {
      projectId: 'project-123',
      serviceId: 'service-123',
    })).resolves.toEqual({ id: 'dry-run' });

    expect(execMock).not.toHaveBeenCalled();
  });

  it('rejects invalid Railway config before CLI work', async () => {
    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      projectId: '   ',
      serviceId: 'service-123',
    })).rejects.toThrow('deploy-railway requires projectId');

    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      projectId: 'project-123',
      serviceId: 'service/123',
    })).rejects.toThrow('serviceId must be a single URL path segment');

    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      projectId: 'project-123',
      serviceId: 'service-123',
      environment: 'bad env',
    })).rejects.toThrow('environment must contain only letters');

    expect(execMock).not.toHaveBeenCalled();
  });

  it('runs railway up with normalized service and environment values', async () => {
    execMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

    const result = await adapter.ship(fakeShipContext({
      channel: 'stable',
      dryRun: false,
      version: '1.2.3',
      secret: makeVault({ RAILWAY_TOKEN: 'mock-token' }),
    }) as any, {
      projectId: ' project-123 ',
      serviceId: ' service-123 ',
      environment: ' prod_1 ',
    });

    expect(execMock).toHaveBeenCalledWith('railway', [
      'up',
      '--ci',
      '--service',
      'service-123',
      '--environment',
      'prod_1',
    ], expect.objectContaining({
      env: { RAILWAY_TOKEN: 'mock-token' },
      throwOnNonZero: true,
    }));
    expect(result).toEqual({
      id: 'service-123@1.2.3',
      meta: { projectId: 'project-123', environment: 'prod_1' },
    });
  });
});
