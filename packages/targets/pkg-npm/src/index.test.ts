import { fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

import target from './index.js';

smokeTest(target, { idPrefix: 'pkg', requireKind: true });

const tempDirs: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('npm package publishing', () => {
  it('keeps dry-run shipping side-effect free', async () => {
    const result = await target.ship(fakeShipContext({ dryRun: true }) as any, {
      packageDir: 'packages/my-lib',
      access: 'public',
    });

    expect(result).toEqual({ id: 'dry-run' });
    expect(execMock).not.toHaveBeenCalled();
  });

  it('publishes with a temporary npmrc and returns the package URL', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-npm-project-'));
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-npm-out-'));
    const pkgDir = join(projectDir, 'packages', 'my-lib');
    tempDirs.push(projectDir, outDir);
    await mkdir(pkgDir, { recursive: true });
    await writeFile(join(pkgDir, 'package.json'), `${JSON.stringify({ name: '@acme/my-lib' })}\n`, 'utf-8');

    execMock.mockImplementationOnce(async (_bin, _args, opts) => {
      const npmrc = await readFile(opts.env.NPM_CONFIG_USERCONFIG, 'utf-8');
      expect(npmrc).toContain('//registry.npmjs.org/:_authToken=test-token');
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    const ctx = fakeShipContext({
      projectDir,
      outDir,
      version: '1.2.3',
      channel: 'stable',
      dryRun: false,
      env: { CI: 'true' },
      secret: (key: string) => key === 'NPM_TOKEN' ? 'test-token' : undefined,
    });

    const result = await target.ship(ctx as any, {
      packageDir: 'packages/my-lib',
      access: 'restricted',
    });

    expect(execMock).toHaveBeenCalledWith('npm', [
      'publish',
      '--registry=https://registry.npmjs.org',
      '--tag=latest',
      '--access=restricted',
    ], {
      cwd: pkgDir,
      log: ctx.log,
      env: {
        CI: 'true',
        NPM_CONFIG_USERCONFIG: join(outDir, 'npm-publish.npmrc'),
      },
      throwOnNonZero: true,
    });
    await expect(readFile(join(outDir, 'npm-publish.npmrc'), 'utf-8')).rejects.toThrow();
    await expect(readFile(join(pkgDir, '.npmrc'), 'utf-8')).rejects.toThrow();
    expect(result).toEqual({
      id: '@acme/my-lib@1.2.3',
      url: 'https://www.npmjs.com/package/@acme/my-lib',
    });
  });
});
