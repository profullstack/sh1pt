import { contractTestTarget, fakeBuildContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'console', requireKind: true });

const sampleConfig = {
  steamAppId: 123456,
  depotIds: [
    { platform: 'linux' as const, depotId: 123457 },
    { platform: 'windows' as const, depotId: 123458 },
  ],
  branch: 'beta',
  binariesDir: '/tmp/builds',
  submitDeckVerification: true,
};

contractTestTarget(adapter, { sampleConfig });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Steam target planning', () => {
  it('writes an inspectable Steam depot build plan', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-steam-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({ outDir }) as any, sampleConfig);
    expect(result.artifact).toBe(join(outDir, 'steam', 'steam-build-plan.json'));

    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan.steamAppId).toBe(123456);
    expect(plan.depotIds).toEqual(sampleConfig.depotIds);
    expect(plan.branch).toBe('beta');
    expect(plan.binariesDir).toBe('/tmp/builds');
    expect(plan.submitDeckVerification).toBe(true);
  });
});
