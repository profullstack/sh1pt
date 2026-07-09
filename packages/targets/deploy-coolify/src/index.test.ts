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

const baseConfig = {
  baseUrl: 'https://coolify.example.com/',
  projectUuid: 'project-123',
};

describe('Coolify deployment target', () => {
  it('keeps dry-run shipping side-effect free while validating config', async () => {
    await expect(adapter.ship(fakeShipContext({
      channel: 'beta',
      dryRun: true,
    }) as any, baseConfig)).resolves.toEqual({ id: 'dry-run' });

    expect(execMock).not.toHaveBeenCalled();
  });

  it('rejects invalid Coolify config before curl work', async () => {
    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      ...baseConfig,
      baseUrl: 'http://coolify.example.com',
    })).rejects.toThrow('baseUrl must use HTTPS');

    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      ...baseConfig,
      projectUuid: 'project/123',
    })).rejects.toThrow('projectUuid must be a single URL-safe segment');

    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      ...baseConfig,
      applicationUuid: '   ',
    })).rejects.toThrow('deploy-coolify requires applicationUuid');

    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      ...baseConfig,
      environmentName: 'bad env',
    })).rejects.toThrow('environmentName must contain only letters');

    expect(execMock).not.toHaveBeenCalled();
  });

  it('posts a deployment to the normalized Coolify deploy URL', async () => {
    execMock.mockResolvedValue({ exitCode: 0, stdout: '{"status":"queued"}\n', stderr: '' });

    const ctx = fakeShipContext({
      channel: 'stable',
      dryRun: false,
      version: '1.2.3',
      secret: makeVault({ COOLIFY_API_TOKEN: 'mock-token' }),
    });

    const result = await adapter.ship(ctx as any, {
      ...baseConfig,
      applicationUuid: 'app-123',
    });

    expect(execMock).toHaveBeenCalledWith('curl', [
      '-s',
      '-X',
      'POST',
      'https://coolify.example.com/api/v1/deploy?uuid=app-123',
      '-H',
      'Authorization: Bearer mock-token',
    ], {
      log: ctx.log,
      throwOnNonZero: true,
    });
    expect(result).toEqual({
      id: 'app-123@1.2.3',
      meta: {
        baseUrl: 'https://coolify.example.com',
        environment: 'production',
        rawResponse: '{"status":"queued"}',
      },
    });
  });
});
