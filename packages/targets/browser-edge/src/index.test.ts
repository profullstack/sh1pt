import { fakeBuildContext, smokeTest } from '@profullstack/sh1pt-core/testing';
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

describe('browser-edge target adapter', () => {
  it('writes a package plan without touching the source directory in dry-run builds', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-edge-out-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-edge-project-'));
    tempDirs.push(outDir, projectDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      projectDir,
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      productId: 'edge-product',
      sourceDir: 'extension-dist',
    });

    expect(execMock).not.toHaveBeenCalled();
    expect(result.artifact).toBe(join(outDir, 'edge-package.json'));
    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan).toEqual({
      provider: 'microsoft-edge-addons',
      productId: 'edge-product',
      version: '1.2.3',
      sourceDir: join(projectDir, 'extension-dist'),
      artifact: join(outDir, 'edge-product-1.2.3.zip'),
      command: ['zip', '-r', join(outDir, 'edge-product-1.2.3.zip'), '.'],
      cwd: join(projectDir, 'extension-dist'),
    });
  });

  it('packages the project-relative source directory with zip for real builds', async () => {
    execMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-edge-out-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-edge-project-'));
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
      productId: 'edge-product',
    });

    const artifact = join(outDir, 'edge-product-1.2.3.zip');
    expect(execMock).toHaveBeenCalledWith('zip', ['-r', artifact, '.'], {
      cwd: sourceDir,
      log: ctx.log,
      throwOnNonZero: true,
    });
    expect(result).toEqual({ artifact });
  });
});
