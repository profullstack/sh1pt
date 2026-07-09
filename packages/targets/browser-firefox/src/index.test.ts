import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
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

import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'browser', requireKind: true });

const tempDirs: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('browser-firefox target adapter', () => {
  it('writes a package plan without touching the source directory in dry-run builds', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-firefox-out-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-firefox-project-'));
    tempDirs.push(outDir, projectDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      projectDir,
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      extensionId: 'myext@example.com',
      sourceDir: 'extension-dist',
      channel: 'unlisted',
    });

    expect(execMock).not.toHaveBeenCalled();
    expect(result.artifact).toBe(join(outDir, 'myext-example.com-1.2.3.firefox-plan.json'));
    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan).toEqual({
      provider: 'mozilla-addons',
      extensionId: 'myext@example.com',
      version: '1.2.3',
      sourceDir: join(projectDir, 'extension-dist'),
      artifact: join(outDir, 'myext-example.com-1.2.3.zip'),
      channel: 'unlisted',
      build: {
        command: 'web-ext',
        args: [
          'build',
          '--source-dir',
          join(projectDir, 'extension-dist'),
          '--artifacts-dir',
          outDir,
          '--filename',
          'myext-example.com-1.2.3.zip',
        ],
        cwd: projectDir,
      },
    });
  });

  it('packages the project-relative source directory with web-ext for real builds', async () => {
    execMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-firefox-out-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-firefox-project-'));
    const sourceDir = join(projectDir, 'dist');
    tempDirs.push(outDir, projectDir);
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, 'manifest.json'), JSON.stringify({ manifest_version: 3 }), 'utf-8');

    const ctx = fakeBuildContext({
      outDir,
      projectDir,
      version: '1.2.3',
      dryRun: false,
    });
    const result = await adapter.build(ctx as any, {
      extensionId: '{firefox-addon}',
    });

    const artifact = join(outDir, 'firefox-addon-1.2.3.zip');
    expect(execMock).toHaveBeenCalledWith('web-ext', [
      'build',
      '--source-dir',
      sourceDir,
      '--artifacts-dir',
      outDir,
      '--filename',
      'firefox-addon-1.2.3.zip',
    ], {
      cwd: projectDir,
      log: ctx.log,
      throwOnNonZero: true,
    });
    expect(result).toEqual({ artifact });
  });

  it('rejects invalid AMO package config before packaging or shipping', async () => {
    await expect(adapter.build(fakeBuildContext({ dryRun: true }) as any, {
      extensionId: '',
    })).rejects.toThrow('browser-firefox requires extensionId');

    await expect(adapter.build(fakeBuildContext({ dryRun: true }) as any, {
      extensionId: 'my ext@example.com',
    })).rejects.toThrow('extensionId must not contain whitespace');

    await expect(adapter.build(fakeBuildContext({ dryRun: true }) as any, {
      extensionId: 'myext@example.com',
      sourceDir: '',
    })).rejects.toThrow('browser-firefox requires sourceDir');

    await expect(adapter.ship(fakeShipContext({ dryRun: true }) as any, {
      extensionId: 'myext@example.com',
      channel: 'beta',
    } as any)).rejects.toThrow('channel must be listed or unlisted');

    expect(execMock).not.toHaveBeenCalled();
  });
});
