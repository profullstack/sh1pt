import { fakeBuildContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'browser', requireKind: true });

const execMock = vi.hoisted(() => vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })));

vi.mock('@profullstack/sh1pt-core', async () => {
  const actual = await vi.importActual<typeof import('@profullstack/sh1pt-core')>('@profullstack/sh1pt-core');
  return {
    ...actual,
    exec: execMock,
  };
});

const tempDirs: string[] = [];

afterEach(async () => {
  execMock.mockClear();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Microsoft Edge browser target', () => {
  it('writes a path-safe dry-run package plan without touching source files', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-edge-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-project-'));
    tempDirs.push(outDir, projectDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      projectDir,
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      productId: 'edge-product',
      sourceDir: 'dist-edge',
    });

    expect(execMock).not.toHaveBeenCalled();
    expect(result.artifact).toBe(join(outDir, 'edge-package-plan.json'));
    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan).toEqual({
      provider: 'microsoft-edge-addons',
      productId: 'edge-product',
      version: '1.2.3',
      sourceDir: join(projectDir, 'dist-edge'),
      expectedArtifact: join(outDir, 'edge-product-1.2.3.zip'),
      command: ['zip', '-r', join(outDir, 'edge-product-1.2.3.zip'), '.'],
    });
  });

  it('uses the shared exec helper for real zip packaging', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-edge-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-project-'));
    const sourceDir = join(projectDir, 'dist');
    tempDirs.push(outDir, projectDir);
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, 'manifest.json'), JSON.stringify({ manifest_version: 3 }), 'utf-8');

    const result = await adapter.build(fakeBuildContext({
      outDir,
      projectDir,
      version: '1.2.3',
      dryRun: false,
    }) as any, {
      productId: 'edge-product',
    });

    expect(result.artifact).toBe(join(outDir, 'edge-product-1.2.3.zip'));
    expect(execMock).toHaveBeenCalledWith('zip', ['-r', join(outDir, 'edge-product-1.2.3.zip'), '.'], expect.objectContaining({
      cwd: sourceDir,
      throwOnNonZero: true,
    }));
  });
});
