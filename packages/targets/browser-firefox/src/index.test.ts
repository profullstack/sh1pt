import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'browser', requireKind: true });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Firefox browser target', () => {
  it('writes an inspectable dry-run package plan', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-firefox-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-project-'));
    tempDirs.push(outDir, projectDir);

    const result = await adapter.build(fakeBuildContext({
      channel: 'beta',
      outDir,
      projectDir,
      version: '1.2.3',
    }) as any, {
      extensionId: '{myext@example.com}',
      sourceDir: 'web-ext-artifacts',
      channel: 'unlisted',
    });

    expect(result.artifact).toBe(join(outDir, 'firefox-package-plan.json'));
    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan).toMatchObject({
      provider: 'firefox-amo',
      extensionId: '{myext@example.com}',
      version: '1.2.3',
      sourceDir: join(projectDir, 'web-ext-artifacts'),
      channel: 'unlisted',
      expectedArtifact: join(outDir, '_myext_example.com_-1.2.3.zip'),
    });
    expect(plan.command).toEqual([
      'web-ext',
      'build',
      '--source-dir',
      join(projectDir, 'web-ext-artifacts'),
      '--artifacts-dir',
      outDir,
    ]);
  });

  it('keeps dry-run shipping side-effect free with resolved metadata', async () => {
    await expect(adapter.ship(fakeShipContext({
      projectDir: '/repo',
      dryRun: true,
    }) as any, {
      extensionId: 'myext@example.com',
      sourceDir: 'dist-firefox',
    })).resolves.toMatchObject({
      id: 'dry-run',
      meta: {
        channel: 'listed',
        sourceDir: join('/repo', 'dist-firefox'),
      },
    });
  });
});
