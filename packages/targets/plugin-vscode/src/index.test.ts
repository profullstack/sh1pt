import { fakeBuildContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'plugin', requireKind: true });

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

describe('VS Code plugin target', () => {
  it('writes a deterministic dry-run package plan without invoking vsce', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-vscode-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-project-'));
    tempDirs.push(outDir, projectDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      projectDir,
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      publisher: 'acme',
      extensionName: 'tools',
      packageDir: 'extensions/tools',
      target: 'linux-x64',
    });

    expect(execMock).not.toHaveBeenCalled();
    expect(result.artifact).toBe(join(outDir, 'vscode-package-plan.json'));
    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan).toEqual({
      provider: 'vscode-marketplace',
      extensionId: 'acme.tools',
      version: '1.2.3',
      packageDir: join(projectDir, 'extensions/tools'),
      target: 'linux-x64',
      expectedArtifact: join(outDir, 'tools-1.2.3.vsix'),
      command: ['npx', '--yes', 'vsce', 'package', '--out', outDir, '--target', 'linux-x64'],
    });
  });

  it('keeps real builds on the existing vsce package path', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-vscode-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-project-'));
    tempDirs.push(outDir, projectDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      projectDir,
      version: '1.2.3',
      dryRun: false,
    }) as any, {
      publisher: 'acme',
      extensionName: 'tools',
    });

    expect(result.artifact).toBe(join(outDir, 'tools-1.2.3.vsix'));
    expect(execMock).toHaveBeenCalledWith('npx', ['--yes', 'vsce', '--version'], expect.objectContaining({
      throwOnNonZero: false,
    }));
    expect(execMock).toHaveBeenCalledWith('npx', ['--yes', 'vsce', 'package', '--out', outDir], expect.objectContaining({
      cwd: projectDir,
      throwOnNonZero: true,
    }));
  });
});
