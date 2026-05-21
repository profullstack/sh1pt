import { contractTestTarget, fakeBuildContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'desktop', requireKind: true });

const sampleConfig = {
  appId: 'com.acme.app',
  formats: ['appimage' as const, 'flatpak' as const, 'deb' as const],
  architectures: ['x64' as const],
  flatpak: { remote: 'flathub' },
  apt: { repo: 'acme/stable' },
  direct: { host: 'github-releases' as const, project: 'acme/app' },
};

contractTestTarget(adapter, { sampleConfig });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Linux desktop target planning', () => {
  it('writes an inspectable multi-format package plan', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-linux-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: '1.2.3',
      channel: 'stable',
    }) as any, sampleConfig);
    expect(result.artifact).toBe(join(outDir, 'linux', 'linux-package-plan.json'));

    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan).toMatchObject({
      appId: 'com.acme.app',
      version: '1.2.3',
      channel: 'stable',
      formats: ['appimage', 'flatpak', 'deb'],
      architectures: ['x64'],
      flatpak: { remote: 'flathub' },
      apt: { repo: 'acme/stable' },
      direct: { host: 'github-releases', project: 'acme/app' },
    });
  });
});
