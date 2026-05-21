import { contractTestTarget, fakeBuildContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'desktop', requireKind: true });

const sampleConfig = {
  appId: 'com.acme.deckapp',
  sourceDir: '/tmp/builds/deckapp',
  distribution: 'self-hosted' as const,
  gamingModeLauncher: {
    enabled: true,
    artwork: { hero: 'hero.png', logo: 'logo.png', grid: 'grid.png' },
  },
  flatpakManifest: 'com.acme.deckapp.yml',
  selfHosted: { uploadTo: 'github-pages' as const },
};

contractTestTarget(adapter, { sampleConfig });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('SteamOS target planning', () => {
  it('writes an inspectable Flatpak and launcher plan', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-steamos-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: '2.0.0',
    }) as any, sampleConfig);
    expect(result.artifact).toBe(join(outDir, 'steamos', 'steamos-flatpak-plan.json'));

    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan).toMatchObject({
      appId: 'com.acme.deckapp',
      version: '2.0.0',
      sourceDir: '/tmp/builds/deckapp',
      distribution: 'self-hosted',
      flatpakManifest: 'com.acme.deckapp.yml',
      gamingModeLauncher: sampleConfig.gamingModeLauncher,
      selfHosted: { uploadTo: 'github-pages' },
      outputArtifact: 'com.acme.deckapp.flatpak',
    });
  });
});
