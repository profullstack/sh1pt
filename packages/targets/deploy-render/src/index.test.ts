import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'deploy', requireKind: true });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Render deployment target', () => {
  it('writes a deploy plan with resolved blueprint metadata', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-render-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-project-'));
    tempDirs.push(outDir, projectDir);
    const blueprint = join(projectDir, 'infra', 'render.yaml');
    await mkdir(dirname(blueprint), { recursive: true });
    await writeFile(blueprint, 'services: []\n', 'utf-8');

    const result = await adapter.build(fakeBuildContext({
      outDir,
      projectDir,
      version: '1.2.3',
    }) as any, {
      serviceId: 'srv-123',
      blueprint: 'infra/render.yaml',
      waitForDeploy: true,
    });

    expect(result.artifact).toBe(join(outDir, 'render-deploy.json'));
    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan.provider).toBe('render');
    expect(plan.serviceId).toBe('srv-123');
    expect(plan.blueprint).toBe(blueprint);
    expect(plan.trigger).toBe('api');
    expect(plan.waitForDeploy).toBe(true);
    expect(plan.version).toBe('1.2.3');
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      serviceId: 'srv-123',
    })).resolves.toEqual({ id: 'dry-run' });
  });

  it('rejects invalid Render deploy config before plan or API work', async () => {
    await expect(adapter.build(fakeBuildContext() as any, {
      blueprint: '   ',
    })).rejects.toThrow('deploy-render requires blueprint');

    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      serviceId: '../srv-123',
    })).rejects.toThrow('serviceId must be a single URL path segment');

    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      deployHookUrl: 'http://hooks.render.com/deploy',
    })).rejects.toThrow('deployHookUrl must use HTTPS');
  });

  it('requires a vault token for real API deploys', async () => {
    await expect(adapter.ship(fakeShipContext({
      dryRun: false,
    }) as any, {
      serviceId: 'srv-123',
    })).rejects.toThrow('RENDER_API_KEY not in vault');
  });
});
