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

describe('snapcraft manifest generation', () => {
  it('writes a snapcraft.yaml scaffold from release config', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-snap-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      projectDir: '/repo/myapp',
      version: '1.2.3',
      channel: 'stable',
    }) as any, {
      snapName: 'myapp',
      summary: 'My app CLI',
      description: 'My app ships useful commands.\nPackaged through sh1pt.',
      command: 'bin/myapp',
      base: 'core24',
      confinement: 'strict',
      architectures: ['amd64', 'arm64'],
      plugs: ['network', 'home'],
      stagePackages: ['ca-certificates'],
    });

    expect(result.artifact).toBe(join(outDir, 'snap', 'snapcraft.yaml'));
    const manifest = await readFile(result.artifact, 'utf-8');

    expect(manifest).toContain('name: "myapp"');
    expect(manifest).toContain('base: "core24"');
    expect(manifest).toContain('version: "1.2.3"');
    expect(manifest).toContain('grade: "stable"');
    expect(manifest).toContain('confinement: "strict"');
    expect(manifest).toContain('build-on: "amd64"');
    expect(manifest).toContain('build-for: "arm64"');
    expect(manifest).toContain('command: "bin/myapp"');
    expect(manifest).toContain('      - "network"');
    expect(manifest).toContain('plugin: "dump"');
    expect(manifest).toContain('source: "/repo/myapp"');
    expect(manifest).toContain('      - "ca-certificates"');
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      snapName: 'myapp',
    })).resolves.toEqual({ id: 'dry-run' });
  });
});
