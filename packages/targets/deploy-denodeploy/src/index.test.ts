import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'deploy', requireKind: true });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Deno Deploy target', () => {
  it('writes a deployctl plan with project, files, env, and production routing', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-deno-deploy-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-project-'));
    tempDirs.push(outDir, projectDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      projectDir,
      version: '1.2.3',
      channel: 'stable',
    }) as any, {
      project: 'edge-api',
      org: 'acme',
      entrypoint: 'src/server.ts',
      includeFiles: ['static/**'],
      excludeFiles: ['fixtures/**'],
      env: { RELEASE: '1.2.3' },
      envFiles: ['.env.production'],
    });

    expect(result.artifact).toBe(join(outDir, 'deno-deploy.json'));
    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan.provider).toBe('deno-deploy');
    expect(plan.project).toBe('edge-api');
    expect(plan.org).toBe('acme');
    expect(plan.entrypoint).toBe('src/server.ts');
    expect(plan.prod).toBe(true);
    expect(plan.projectDir).toBe(projectDir);
    expect(plan.command).toEqual([
      'deployctl',
      'deploy',
      '--project=edge-api',
      '--entrypoint=src/server.ts',
      '--org=acme',
      '--prod',
      '--include=static/**',
      '--exclude=fixtures/**',
      '--env=RELEASE=1.2.3',
      '--env-file=.env.production',
    ]);
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({
      channel: 'beta',
      dryRun: true,
    }) as any, {
      project: 'edge-api',
      entrypoint: 'src/server.ts',
      includeFiles: ['static/**'],
    })).resolves.toMatchObject({
      id: 'dry-run',
      meta: {
        command: expect.arrayContaining(['deploy', '--project=edge-api', '--entrypoint=src/server.ts']),
      },
    });
  });

  it('requires a vault token for real deployments', async () => {
    await expect(adapter.ship(fakeShipContext({
      dryRun: false,
    }) as any, {
      project: 'edge-api',
      entrypoint: 'src/server.ts',
    })).rejects.toThrow('DENO_DEPLOY_TOKEN not in vault');
  });
});
