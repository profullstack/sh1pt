import { fakeBuildContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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

describe('Safari browser target', () => {
  it('writes a dry-run package plan before invoking Xcode tooling', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-safari-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-project-'));
    tempDirs.push(outDir, projectDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      projectDir,
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      bundleId: 'com.acme.Extension',
      projectDir: 'apps/safari',
      scheme: 'SafariExt',
    });

    expect(execMock).not.toHaveBeenCalled();
    expect(result.artifact).toBe(join(outDir, 'safari-package-plan.json'));
    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan).toMatchObject({
      provider: 'safari-web-extension',
      bundleId: 'com.acme.Extension',
      version: '1.2.3',
      projectDir: join(projectDir, 'apps/safari'),
      scheme: 'SafariExt',
      archivePath: join(outDir, 'com.acme.Extension-1.2.3.xcarchive'),
    });
    expect(plan.commands).toEqual([
      [
        'xcrun',
        'safari-web-extension-converter',
        join(projectDir, 'apps/safari', 'dist'),
        '--app-name',
        'Extension',
        '--bundle-identifier',
        'com.acme.Extension',
        '--force',
        '--no-open',
      ],
      [
        'xcodebuild',
        '-project',
        join(projectDir, 'apps/safari', 'SafariExt.xcodeproj'),
        '-scheme',
        'SafariExt',
        '-archivePath',
        join(outDir, 'com.acme.Extension-1.2.3.xcarchive'),
        '-destination',
        'generic/platform=macos',
        'archive',
      ],
    ]);
  });
});
