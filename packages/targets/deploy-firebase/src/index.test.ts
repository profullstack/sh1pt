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

describe('Firebase deployment target', () => {
  it('writes a deploy plan with the resolved Firebase CLI command', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-firebase-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-project-'));
    tempDirs.push(outDir, projectDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      projectDir,
      version: '1.2.3',
    }) as any, {
      projectId: 'my-firebase-project',
      only: ['hosting', 'functions'],
      config: 'firebase.json',
      message: 'release 1.2.3',
    });

    expect(result.artifact).toBe(join(outDir, 'firebase-deploy.json'));
    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan.provider).toBe('firebase');
    expect(plan.projectId).toBe('my-firebase-project');
    expect(plan.only).toEqual(['hosting', 'functions']);
    expect(plan.config).toBe(join(projectDir, 'firebase.json'));
    expect(plan.command).toEqual([
      'npx',
      '--yes',
      'firebase-tools',
      'deploy',
      '--project',
      'my-firebase-project',
      '--json',
      '--only',
      'hosting,functions',
      '--config',
      join(projectDir, 'firebase.json'),
      '--message',
      'release 1.2.3',
    ]);
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      projectId: 'my-firebase-project',
      only: ['hosting'],
    })).resolves.toMatchObject({
      id: 'dry-run',
      meta: {
        command: expect.arrayContaining(['firebase-tools', 'deploy', '--only', 'hosting']),
      },
    });
  });

  it('rejects invalid Firebase config before plan or CLI work', async () => {
    await expect(adapter.build(fakeBuildContext() as any, {
      projectId: 'bad/project',
    })).rejects.toThrow('projectId must contain only letters');

    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      projectId: 'my-firebase-project',
      only: ['hosting,functions'],
    })).rejects.toThrow('only[0] must not contain commas');

    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      projectId: 'my-firebase-project',
      only: ['   '],
    })).rejects.toThrow('deploy-firebase requires only[0]');

    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      projectId: 'my-firebase-project',
      message: '   ',
    })).rejects.toThrow('deploy-firebase requires message');
  });

  it('requires a vault token for real deployments', async () => {
    await expect(adapter.ship(fakeShipContext({
      dryRun: false,
    }) as any, {
      projectId: 'my-firebase-project',
    })).rejects.toThrow('FIREBASE_TOKEN not in vault');
  });
});
