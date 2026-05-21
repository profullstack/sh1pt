import { fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { execMock } = vi.hoisted(() => ({
  execMock: vi.fn(),
}));

vi.mock('@profullstack/sh1pt-core', async () => ({
  ...await vi.importActual<typeof import('@profullstack/sh1pt-core')>('@profullstack/sh1pt-core'),
  exec: execMock,
}));

import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'pkg', requireKind: true });

const tempDirs: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('GitHub Packages target publishing', () => {
  it('keeps dry-run shipping side-effect free', async () => {
    const result = await adapter.ship(fakeShipContext({ dryRun: true }) as any, {
      org: 'acme',
      packageDir: 'packages/my-lib',
    });

    expect(result).toEqual({ id: 'dry-run' });
    expect(execMock).not.toHaveBeenCalled();
  });

  it('publishes with a temporary npm userconfig and removes it afterwards', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-ghpackages-'));
    tempDirs.push(outDir);
    execMock.mockImplementationOnce(async (_bin, _args, opts) => {
      const npmrc = await readFile(opts.env.NPM_CONFIG_USERCONFIG, 'utf-8');
      expect(npmrc).toContain('//npm.pkg.github.com/:_authToken=test-token');
      expect(npmrc).toContain('@acme:registry=https://npm.pkg.github.com/');
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    const ctx = fakeShipContext({
      projectDir: 'C:/repo',
      outDir,
      version: '1.2.3',
      dryRun: false,
      env: { CI: 'true' },
      secret: (key: string) => key === 'GH_PACKAGES_TOKEN' ? 'test-token' : undefined,
    });
    const result = await adapter.ship(ctx as any, {
      org: 'acme',
      packageDir: 'packages/my-lib',
      access: 'restricted',
    });

    expect(execMock).toHaveBeenCalledWith('npm', [
      'publish',
      '--registry=https://npm.pkg.github.com',
      '--access=restricted',
    ], {
      cwd: join('C:/repo', 'packages/my-lib'),
      log: ctx.log,
      env: {
        CI: 'true',
        NPM_CONFIG_USERCONFIG: join(outDir, 'github-packages.npmrc'),
      },
    });
    await expect(readFile(join(outDir, 'github-packages.npmrc'), 'utf-8')).rejects.toThrow();
    expect(result).toEqual({
      id: '@acme/1.2.3',
      url: 'https://github.com/acme/packages',
    });
  });

  it('removes the temporary npm userconfig when publish fails', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-ghpackages-fail-'));
    tempDirs.push(outDir);
    execMock.mockRejectedValueOnce(new Error('publish failed'));

    const ctx = fakeShipContext({
      projectDir: 'C:/repo',
      outDir,
      dryRun: false,
      secret: (key: string) => key === 'GH_PACKAGES_TOKEN' ? 'test-token' : undefined,
    });

    await expect(adapter.ship(ctx as any, {
      org: 'acme',
      packageDir: 'packages/my-lib',
    })).rejects.toThrow('publish failed');
    await expect(readFile(join(outDir, 'github-packages.npmrc'), 'utf-8')).rejects.toThrow();
  });
});
