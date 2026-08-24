import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { execMock } = vi.hoisted(() => ({
  execMock: vi.fn(),
}));

vi.mock('@profullstack/sh1pt-core', async () => ({
  ...(await vi.importActual<typeof import('@profullstack/sh1pt-core')>('@profullstack/sh1pt-core')),
  exec: execMock,
}));

import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'deploy', requireKind: true });

const tempDirs: string[] = [];

beforeEach(() => {
  execMock.mockReset();
});

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

  it('rejects invalid Netlify config before plan or CLI work', async () => {
    await expect(adapter.build(fakeBuildContext() as any, {
      dir: '   ',
    })).rejects.toThrow('deploy-netlify requires dir');

    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      siteId: 'site/123',
    })).rejects.toThrow('siteId must be a single URL path segment');

    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      message: '   ',
    })).rejects.toThrow('deploy-netlify requires message');
  });

  it('requires a vault token for real deployments', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: false,
    }) as any, {
      siteId: 'site-123',
    })).rejects.toThrow('NETLIFY_AUTH_TOKEN not in vault');
  });

  it('passes the Netlify token through the child environment, not argv', async () => {
    execMock.mockResolvedValue({ exitCode: 0, stdout: '{"deploy_id":"deploy-1"}', stderr: '' });

    await adapter.ship(fakeShipContext({
      dryRun: false,
      secret: (key: string) => key === 'NETLIFY_AUTH_TOKEN' ? 'netlify-secret-token' : undefined,
    }) as any, {
      siteId: 'site-1',
    });

    const [bin, args, options] = execMock.mock.calls[0] ?? [];
    expect(bin).toBe('npx');
    expect(args).not.toContain('netlify-secret-token');
    expect(args).not.toContain('--auth');
    expect(options.env.NETLIFY_AUTH_TOKEN).toBe('netlify-secret-token');
  });
});
