import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'pkg', requireKind: true });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('F-Droid target', () => {
  it('renders fdroiddata YAML metadata for main repository submissions', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-fdroid-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({ outDir }) as any, {
      packageName: 'com.acme.app',
      mode: 'main-repo',
      metadata: {
        categories: ['Internet', 'Development'],
        license: 'MIT',
        sourceRepo: 'https://github.com/acme/app',
        issueTracker: 'https://github.com/acme/app/issues',
        authorName: 'Acme Labs',
        name: 'Acme App',
        summary: 'A small FOSS app.',
        description: 'First line.\nSecond line.',
      },
    });

    expect(result.artifact).toBe(join(outDir, 'com.acme.app.yml'));
    await expect(readFile(result.artifact, 'utf-8')).resolves.toBe([
      'Categories:',
      '  - "Internet"',
      '  - "Development"',
      'License: "MIT"',
      'AuthorName: "Acme Labs"',
      'Name: "Acme App"',
      'SourceCode: "https://github.com/acme/app"',
      'IssueTracker: "https://github.com/acme/app/issues"',
      'Summary: "A small FOSS app."',
      'Description: |-',
      '  First line.',
      '  Second line.',
      'RepoType: "git"',
      'Repo: "https://github.com/acme/app"',
      'UpdateCheckMode: None',
      'AutoUpdateMode: None',
      '',
    ].join('\n'));
  });

  it('writes a self-hosted fdroid update plan in dry-run builds', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-fdroid-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      projectDir: '/repo',
      outDir,
      dryRun: true,
    }) as any, {
      packageName: 'com.acme.app',
      mode: 'self-hosted',
      selfHosted: {
        repoDir: 'dist/fdroid',
        uploadTo: 'github-pages',
      },
    });

    expect(result.artifact).toBe(join(outDir, 'fdroid-update-plan.json'));
    await expect(readFile(result.artifact, 'utf-8').then(JSON.parse)).resolves.toEqual({
      cwd: join('/repo', 'dist/fdroid'),
      command: ['fdroid', 'update', '-c'],
    });
  });

  it('keeps dry-run shipping side-effect free for main repo submissions', async () => {
    await expect(adapter.ship(fakeShipContext({ dryRun: true }) as any, {
      packageName: 'com.acme.app',
      mode: 'main-repo',
      metadata: {
        categories: ['Development'],
        license: 'Apache-2.0',
        sourceRepo: 'https://github.com/acme/app',
      },
    })).resolves.toEqual({
      id: 'dry-run',
      meta: {
        repository: 'fdroid/fdroiddata',
        metadataFile: 'metadata/com.acme.app.yml',
      },
    });
  });
});
