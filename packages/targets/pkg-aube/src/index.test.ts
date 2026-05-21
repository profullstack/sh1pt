import { contractTestTarget, fakeBuildContext, fakeShipContext } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import target from './index.js';

contractTestTarget(target, {
  sampleConfig: { packageDir: './fake', packageName: '@acme/fake', access: 'public' },
});

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Aube package target', () => {
  it('writes a dry-run pack plan using the documented Aube pack flags', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-aube-'));
    tempDirs.push(outDir);

    const result = await target.build(fakeBuildContext({
      projectDir: '/repo',
      outDir,
      dryRun: true,
    }) as any, {
      packageDir: 'packages/app',
      registry: 'https://registry.example.com',
      ignoreScripts: true,
    });

    expect(result.artifact).toBe(join(outDir, 'aube-pack-plan.json'));
    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan.cwd).toBe(join('/repo', 'packages/app'));
    expect(plan.command).toEqual([
      'aube',
      'pack',
      '--json',
      '--pack-destination',
      outDir,
      '--registry=https://registry.example.com',
      '--ignore-scripts',
      '--dry-run',
    ]);
  });

  it('keeps dry-run publishing side-effect free and exposes the Aube publish command', async () => {
    await expect(target.ship(fakeShipContext({
      projectDir: '/repo',
      channel: 'beta',
      dryRun: true,
    }) as any, {
      packageDir: 'packages/app',
      packageName: '@acme/app',
      access: 'public',
      tag: 'next',
      provenance: true,
      registry: 'https://registry.example.com',
    })).resolves.toEqual({
      id: 'dry-run',
      meta: {
        cwd: join('/repo', 'packages/app'),
        command: [
          'aube',
          'publish',
          '--json',
          '--tag=next',
          '--access=public',
          '--registry=https://registry.example.com',
          '--provenance',
          '--dry-run',
        ],
      },
    });
  });
});
