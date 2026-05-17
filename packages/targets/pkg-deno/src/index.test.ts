import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
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

describe('deno.land/x package target', () => {
  it('writes a git-tag publish plan for deno.land/x', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-deno-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: '1.2.3',
    }) as any, {
      moduleName: 'my_mod',
      sourceRepo: 'acme/my-mod',
      tagPrefix: 'v',
      remote: 'upstream',
    });

    expect(result).toEqual({
      artifact: join(outDir, 'deno-land-publish.json'),
      meta: {
        tag: 'v1.2.3',
        url: 'https://deno.land/x/my_mod@v1.2.3',
      },
    });

    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan).toMatchObject({
      provider: 'deno.land/x',
      moduleName: 'my_mod',
      sourceRepo: 'acme/my-mod',
      version: '1.2.3',
      tag: 'v1.2.3',
      remote: 'upstream',
      url: 'https://deno.land/x/my_mod@v1.2.3',
      commands: {
        tag: ['git', 'tag', 'v1.2.3'],
        push: ['git', 'push', 'upstream', 'v1.2.3'],
      },
    });
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      moduleName: 'my_mod',
      sourceRepo: 'acme/my-mod',
    })).resolves.toMatchObject({
      id: 'dry-run',
      meta: {
        tag: '1.2.3',
        remote: 'origin',
        url: 'https://deno.land/x/my_mod@1.2.3',
      },
    });
    expect(execMock).not.toHaveBeenCalled();
  });

  it('creates and pushes the release tag in real ship mode', async () => {
    execMock
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

    const ctx = fakeShipContext({
      projectDir: '/repo',
      version: '1.2.3',
      dryRun: false,
      env: { CI: 'true' },
    });
    const result = await adapter.ship(ctx as any, {
      moduleName: 'my_mod',
      sourceRepo: 'acme/my-mod',
      tagPrefix: 'v',
      remote: 'upstream',
      tagMessage: 'Release v1.2.3',
    });

    expect(execMock).toHaveBeenNthCalledWith(1, 'git', ['tag', '-a', 'v1.2.3', '-m', 'Release v1.2.3'], {
      cwd: '/repo',
      env: { CI: 'true' },
      log: ctx.log,
      throwOnNonZero: true,
    });
    expect(execMock).toHaveBeenNthCalledWith(2, 'git', ['push', 'upstream', 'v1.2.3'], {
      cwd: '/repo',
      env: { CI: 'true' },
      log: ctx.log,
      throwOnNonZero: true,
    });
    expect(result).toEqual({
      id: 'my_mod@v1.2.3',
      url: 'https://deno.land/x/my_mod@v1.2.3',
      meta: {
        tag: 'v1.2.3',
        remote: 'upstream',
        sourceRepo: 'acme/my-mod',
      },
    });
  });

  it('requires module name and linked source repository', async () => {
    await expect(adapter.build(fakeBuildContext() as any, {
      moduleName: '',
      sourceRepo: 'acme/my-mod',
    })).rejects.toThrow('pkg-deno requires moduleName');

    await expect(adapter.build(fakeBuildContext() as any, {
      moduleName: 'my_mod',
      sourceRepo: '',
    })).rejects.toThrow('pkg-deno requires sourceRepo');
  });
});
