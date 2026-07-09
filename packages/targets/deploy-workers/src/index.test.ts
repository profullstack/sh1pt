import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { exec } from '@profullstack/sh1pt-core';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

vi.mock('@profullstack/sh1pt-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@profullstack/sh1pt-core')>()),
  exec: vi.fn(),
}));

smokeTest(adapter, { idPrefix: 'deploy', requireKind: true });

const tempDirs: string[] = [];
const execMock = vi.mocked(exec);

afterEach(async () => {
  execMock.mockReset();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Cloudflare Workers deployment target', () => {
  it('writes a dry-run deploy plan with the resolved Wrangler command', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-workers-'));
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-project-'));
    tempDirs.push(outDir, projectDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      projectDir,
      version: '1.2.3',
      channel: 'stable',
    }) as any, {
      name: 'api-worker',
      accountId: 'account-123',
      routes: ['api.example.com/*'],
      compatibilityDate: '2026-05-21',
      entrypoint: 'src/worker.ts',
      configPath: 'wrangler.toml',
    });

    expect(result.artifact).toBe(join(outDir, 'workers-deploy.json'));
    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan).toEqual({
      provider: 'cloudflare-workers',
      name: 'api-worker',
      accountId: 'account-123',
      env: 'production',
      routes: ['api.example.com/*'],
      compatibilityDate: '2026-05-21',
      entrypoint: join(projectDir, 'src/worker.ts'),
      configPath: join(projectDir, 'wrangler.toml'),
      version: '1.2.3',
      command: [
        'npx',
        '--yes',
        'wrangler',
        'deploy',
        join(projectDir, 'src/worker.ts'),
        '--name',
        'api-worker',
        '--env',
        'production',
        '--account-id',
        'account-123',
        '--compatibility-date',
        '2026-05-21',
        '--config',
        join(projectDir, 'wrangler.toml'),
        '--route',
        'api.example.com/*',
        '--dry-run',
      ],
    });
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({
      channel: 'beta',
      dryRun: true,
    }) as any, {
      name: 'api-worker',
      accountId: 'account-123',
    })).resolves.toEqual({
      id: 'dry-run',
      meta: {
        command: [
          'npx',
          '--yes',
          'wrangler',
          'deploy',
          '--name',
          'api-worker',
          '--env',
          'preview',
          '--account-id',
          'account-123',
          '--dry-run',
        ],
      },
    });
    expect(execMock).not.toHaveBeenCalled();
  });

  it('rejects invalid Workers config before plan or CLI work', async () => {
    await expect(adapter.build(fakeBuildContext() as any, {
      name: '   ',
      accountId: 'account-123',
    })).rejects.toThrow('deploy-workers requires name');

    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      name: 'api-worker',
      accountId: 'account/123',
    })).rejects.toThrow('accountId must be a single URL-safe segment');

    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      name: 'api-worker',
      accountId: 'account-123',
      routes: ['   '],
    })).rejects.toThrow('deploy-workers requires routes[0]');

    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      name: 'api-worker',
      accountId: 'account-123',
      compatibilityDate: '20260521',
    })).rejects.toThrow('compatibilityDate must use YYYY-MM-DD');

    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      name: 'api-worker',
      accountId: 'account-123',
      vars: { 'bad-key': 'value' },
    })).rejects.toThrow('var "bad-key" must be a valid environment variable name');

    expect(execMock).not.toHaveBeenCalled();
  });

  it('requires a Cloudflare API token for real deployments', async () => {
    await expect(adapter.ship(fakeShipContext({
      dryRun: false,
    }) as any, {
      name: 'api-worker',
      accountId: 'account-123',
    })).rejects.toThrow('CLOUDFLARE_API_TOKEN not in vault');
  });

  it('runs Wrangler deploy with token env and parses the worker URL', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-workers-project-'));
    tempDirs.push(projectDir);
    execMock.mockResolvedValue({
      stdout: 'Uploaded api-worker\nhttps://api-worker.account-123.workers.dev\n',
      stderr: '',
      exitCode: 0,
    });
    const log = vi.fn();

    const result = await adapter.ship(fakeShipContext({
      projectDir,
      version: '1.2.3',
      channel: 'stable',
      dryRun: false,
      env: { EXISTING: '1' },
      secret: (key: string) => key === 'CLOUDFLARE_API_TOKEN' ? 'cf-token' : undefined,
      log,
    }) as any, {
      name: 'api-worker',
      accountId: 'account-123',
      env: 'prod',
      routes: ['api.example.com/*', 'example.com/api/*'],
      vars: { SERVICE_ENV: 'production' },
    });

    expect(execMock).toHaveBeenCalledWith('npx', [
      '--yes',
      'wrangler',
      'deploy',
      '--name',
      'api-worker',
      '--env',
      'prod',
      '--account-id',
      'account-123',
      '--route',
      'api.example.com/*',
      '--route',
      'example.com/api/*',
    ], {
      cwd: projectDir,
      env: {
        EXISTING: '1',
        CLOUDFLARE_API_TOKEN: 'cf-token',
        SERVICE_ENV: 'production',
      },
      log,
      throwOnNonZero: true,
    });
    expect(result).toEqual({
      id: 'api-worker@1.2.3',
      url: 'https://api-worker.account-123.workers.dev',
    });
  });
});
