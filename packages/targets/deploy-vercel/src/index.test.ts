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

describe('Vercel deployment target', () => {
  it('writes a deploy plan with the resolved Vercel CLI command', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-vercel-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-project-'));
    tempDirs.push(outDir, projectDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      projectDir,
      channel: 'stable',
    }) as any, {
      project: 'myapp',
      org: 'acme',
      dir: 'web',
    });

    expect(result.artifact).toBe(join(outDir, 'vercel-deploy.json'));
    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan.provider).toBe('vercel');
    expect(plan.project).toBe('myapp');
    expect(plan.org).toBe('acme');
    expect(plan.dir).toBe(join(projectDir, 'web'));
    expect(plan.prod).toBe(true);
    expect(plan.command).toEqual([
      'npx',
      '--yes',
      'vercel',
      'deploy',
      join(projectDir, 'web'),
      '--yes',
      '--prod',
      '--scope',
      'acme',
    ]);
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({
      channel: 'beta',
      dryRun: true,
    }) as any, {
      project: 'myapp',
      org: 'acme',
      dir: 'web',
    })).resolves.toMatchObject({
      id: 'dry-run',
      meta: {
        command: expect.arrayContaining(['vercel', 'deploy', '--scope', 'acme']),
      },
    });
  });

  it('rejects invalid Vercel config before plan or CLI work', async () => {
    await expect(adapter.build(fakeBuildContext() as any, {
      dir: '   ',
    })).rejects.toThrow('deploy-vercel requires dir');

    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      project: 'bad/project',
    })).rejects.toThrow('project must contain only letters');

    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      org: 'bad org',
    })).rejects.toThrow('org must contain only letters');
  });

  it('requires a vault token for real deployments', async () => {
    await expect(adapter.ship(fakeShipContext({
      dryRun: false,
    }) as any, {
      project: 'myapp',
    })).rejects.toThrow('VERCEL_TOKEN not in vault');
  });
});
