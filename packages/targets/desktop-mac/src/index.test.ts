import { contractTestTarget, fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'desktop', requireKind: true });

const sampleConfig = {
  bundleId: 'com.acme.app',
  teamId: 'ABCDE12345',
  scheme: 'AcmeApp',
  distribution: 'both' as const,
  entitlements: 'AcmeApp.entitlements',
  signingIdentity: 'Developer ID Application: ACME Inc (ABCDE12345)',
};

contractTestTarget(adapter, { sampleConfig });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('macOS target planning', () => {
  it('writes an inspectable archive/export plan', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-macos-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({ outDir }) as any, sampleConfig);
    expect(result.artifact).toBe(join(outDir, 'macos', 'macos-build-plan.json'));

    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan).toMatchObject({
      bundleId: 'com.acme.app',
      teamId: 'ABCDE12345',
      scheme: 'AcmeApp',
      distribution: 'both',
      entitlements: 'AcmeApp.entitlements',
      signingIdentity: 'Developer ID Application: ACME Inc (ABCDE12345)',
      outputArtifact: 'app.pkg',
    });
  });

  it('rejects invalid bundle identifiers while building', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-macos-'));
    tempDirs.push(outDir);

    await expect(adapter.build(fakeBuildContext({ outDir }) as any, {
      ...sampleConfig,
      bundleId: '../Acme',
    })).rejects.toThrow('desktop-mac bundleId must be a valid reverse-DNS identifier');
  });

  it('rejects invalid bundle identifiers while shipping', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: false,
    }) as any, {
      ...sampleConfig,
      bundleId: 'com.acme/app',
    })).rejects.toThrow('desktop-mac bundleId must be a valid reverse-DNS identifier');
  });
});
