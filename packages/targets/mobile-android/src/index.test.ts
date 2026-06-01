import { fakeBuildContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'mobile', requireKind: true });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('mobile-android target adapter', () => {
  it('keeps package names with path separators inside the output directory', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-android-out-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      packageName: '../com.example.app',
    });

    expect(result.artifact).toBe(join(outDir, 'com.example.app-1.2.3.aab'));
  });
});
