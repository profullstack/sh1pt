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

describe('Docker buildx planning', () => {
  it('writes deterministic build and push commands for every registry tag', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-docker-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: 'v1.2.3',
    }) as any, {
      image: 'acme/widget',
      registries: [
        { kind: 'ghcr' },
        { kind: 'custom', host: 'registry.example.com/' },
      ],
      dockerfile: 'docker/prod.Dockerfile',
      context: 'apps/widget',
      platforms: ['linux/amd64'],
      tags: ['edge', 'release-{{version}}'],
      target: 'runner',
      buildArgs: { NODE_ENV: 'production' },
      labels: { 'org.opencontainers.image.source': 'https://github.com/acme/widget' },
    });

    expect(result.artifact).toBe(join(outDir, 'docker-build-plan.json'));

    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan.refs).toEqual([
      'ghcr.io/acme/widget:1.2.3',
      'ghcr.io/acme/widget:latest',
      'ghcr.io/acme/widget:edge',
      'ghcr.io/acme/widget:release-1.2.3',
      'registry.example.com/acme/widget:1.2.3',
      'registry.example.com/acme/widget:latest',
      'registry.example.com/acme/widget:edge',
      'registry.example.com/acme/widget:release-1.2.3',
    ]);
    expect(plan.commands.buildLocal).toEqual([
      'docker',
      'buildx',
      'build',
      '--platform=linux/amd64',
      '--file=docker/prod.Dockerfile',
      '--tag=ghcr.io/acme/widget:1.2.3',
      '--tag=ghcr.io/acme/widget:latest',
      '--tag=ghcr.io/acme/widget:edge',
      '--tag=ghcr.io/acme/widget:release-1.2.3',
      '--tag=registry.example.com/acme/widget:1.2.3',
      '--tag=registry.example.com/acme/widget:latest',
      '--tag=registry.example.com/acme/widget:edge',
      '--tag=registry.example.com/acme/widget:release-1.2.3',
      '--build-arg=NODE_ENV=production',
      '--label=org.opencontainers.image.source=https://github.com/acme/widget',
      '--target=runner',
      `--metadata-file=${join(outDir, 'docker-build-metadata.json')}`,
      `--output=type=oci,dest=${join(outDir, 'acme-widget-1.2.3.oci.tar')}`,
      'apps/widget',
    ]);
    expect(plan.commands.push).toContain('--push');
    expect(plan.commands.push.at(-1)).toBe('apps/widget');
  });

  it('keeps dry-run shipping side-effect free and exposes the buildx push command', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '2.0.0',
      dryRun: true,
    }) as any, {
      image: 'acme/api',
      registries: [{ kind: 'dockerhub' }],
      tags: ['beta-$version'],
    })).resolves.toEqual({
      id: 'dry-run',
      meta: {
        pushes: [
          'docker.io/acme/api:2.0.0',
          'docker.io/acme/api:latest',
          'docker.io/acme/api:beta-2.0.0',
        ],
        command: [
          'docker',
          'buildx',
          'build',
          '--platform=linux/amd64,linux/arm64',
          '--file=Dockerfile',
          '--tag=docker.io/acme/api:2.0.0',
          '--tag=docker.io/acme/api:latest',
          '--tag=docker.io/acme/api:beta-2.0.0',
          '--push',
          '.',
        ],
      },
    });
  });

  it('requires an explicit host for custom registries', async () => {
    await expect(adapter.build(fakeBuildContext() as any, {
      image: 'acme/api',
      registries: [{ kind: 'custom' }],
    })).rejects.toThrow('pkg-docker requires a host for custom registry');
  });
});
