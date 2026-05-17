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

describe('Netlify deployment target', () => {
  it('writes a deploy plan with the resolved Netlify CLI command', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-netlify-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-project-'));
    tempDirs.push(outDir, projectDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      projectDir,
      version: '1.2.3',
      channel: 'stable',
    }) as any, {
      siteId: 'site-123',
      dir: 'dist',
      message: 'release 1.2.3',
    });

    expect(result.artifact).toBe(join(outDir, 'netlify-deploy.json'));
    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan.provider).toBe('netlify');
    expect(plan.siteId).toBe('site-123');
    expect(plan.dir).toBe(join(projectDir, 'dist'));
    expect(plan.prod).toBe(true);
    expect(plan.command).toEqual([
      'npx',
      '--yes',
      'netlify-cli',
      'deploy',
      '--json',
      '--dir',
      join(projectDir, 'dist'),
      '--prod',
      '--site',
      'site-123',
      '--message',
      'release 1.2.3',
    ]);
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      channel: 'beta',
      dryRun: true,
    }) as any, {
      siteId: 'site-123',
      dir: 'dist',
    })).resolves.toMatchObject({
      id: 'dry-run',
      meta: {
        command: expect.arrayContaining(['netlify-cli', 'deploy', '--site', 'site-123']),
      },
    });
  });

  it('requires a vault token for real deployments', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: false,
    }) as any, {
      siteId: 'site-123',
    })).rejects.toThrow('NETLIFY_AUTH_TOKEN not in vault');
  });
});
