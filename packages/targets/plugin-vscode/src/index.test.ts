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

smokeTest(adapter, { idPrefix: 'plugin', requireKind: true });

const tempDirs: string[] = [];
const sampleConfig = {
  publisher: 'acme',
  extensionName: 'sample-extension',
  packageDir: 'extensions/sample-extension',
  target: 'linux-x64',
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('plugin-vscode target adapter', () => {
  it('writes a package plan without invoking vsce in dry-run builds', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-vscode-out-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-vscode-project-'));
    tempDirs.push(outDir, projectDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      projectDir,
      version: '1.2.3',
      dryRun: true,
    }) as any, sampleConfig);

    expect(execMock).not.toHaveBeenCalled();
    expect(result.artifact).toBe(join(outDir, 'vscode-package.json'));
    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan).toEqual({
      provider: 'vscode-marketplace',
      publisher: 'acme',
      extensionName: 'sample-extension',
      version: '1.2.3',
      packageDir: join(projectDir, 'extensions/sample-extension'),
      artifact: join(outDir, 'sample-extension-1.2.3.vsix'),
      command: [
        'npx',
        '--yes',
        'vsce',
        'package',
        '--out',
        outDir,
        '--target',
        'linux-x64',
      ],
    });
  });

  it('packages with vsce for real builds', async () => {
    execMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

    const ctx = fakeBuildContext({
      projectDir: '/repo',
      outDir: '/repo/.sh1pt/out',
      version: '1.2.3',
      dryRun: false,
    });
    const result = await adapter.build(ctx as any, sampleConfig);

    expect(execMock).toHaveBeenNthCalledWith(1, 'npx', ['--yes', 'vsce', '--version'], {
      log: ctx.log,
      throwOnNonZero: false,
    });
    expect(execMock).toHaveBeenNthCalledWith(2, 'npx', [
      '--yes',
      'vsce',
      'package',
      '--out',
      '/repo/.sh1pt/out',
      '--target',
      'linux-x64',
    ], {
      cwd: join('/repo', 'extensions/sample-extension'),
      log: ctx.log,
      throwOnNonZero: true,
    });
    expect(result).toEqual({ artifact: join('/repo/.sh1pt/out', 'sample-extension-1.2.3.vsix') });
  });

  it('keeps dry-run publishing side-effect free without requiring a token', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: true,
      secret: () => undefined,
    }) as any, sampleConfig)).resolves.toEqual({ id: 'dry-run' });

    expect(execMock).not.toHaveBeenCalled();
  });
});
