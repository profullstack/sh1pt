import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { execMock, ensureCliMock } = vi.hoisted(() => ({
  execMock: vi.fn(),
  ensureCliMock: vi.fn(),
}));

vi.mock('@profullstack/sh1pt-core', async () => ({
  ...await vi.importActual<typeof import('@profullstack/sh1pt-core')>('@profullstack/sh1pt-core'),
  exec: execMock,
  ensureCli: ensureCliMock,
}));

import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'deploy', requireKind: true });

const tempDirs: string[] = [];
const sampleConfig = {
  slug: 'acme-widgets',
  sourceDir: 'plugins/acme-widgets',
  ssh: 'deploy@example.com:/var/www/html',
  siteUrl: 'https://example.com',
};

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  vi.clearAllMocks();
  execMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('deploy-wordpress target adapter', () => {
  it('writes a dist-archive plan without invoking wp-cli in dry-run builds', async () => {
    const outDir = await tempDir('sh1pt-wp-out-');
    const projectDir = await tempDir('sh1pt-wp-project-');

    const result = await adapter.build(fakeBuildContext({
      outDir,
      projectDir,
      version: '1.2.3',
      dryRun: true,
    }) as any, sampleConfig);

    expect(execMock).not.toHaveBeenCalled();
    expect(ensureCliMock).not.toHaveBeenCalled();
    expect(result.artifact).toBe(join(outDir, 'wordpress-package.json'));

    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan).toEqual({
      provider: 'wordpress',
      type: 'plugin',
      slug: 'acme-widgets',
      version: '1.2.3',
      sourceDir: join(projectDir, 'plugins/acme-widgets'),
      artifact: join(outDir, 'acme-widgets-1.2.3.zip'),
      command: [
        'wp',
        'dist-archive',
        join(projectDir, 'plugins/acme-widgets'),
        join(outDir, 'acme-widgets-1.2.3.zip'),
        '--format=zip',
      ],
    });
  });

  it('installs the dist-archive command before packaging when it is missing', async () => {
    const outDir = await tempDir('sh1pt-wp-out-');
    const projectDir = await tempDir('sh1pt-wp-project-');

    const ctx = fakeBuildContext({ outDir, projectDir, version: '1.2.3', dryRun: false });
    const result = await adapter.build(ctx as any, sampleConfig);

    expect(ensureCliMock).toHaveBeenCalledWith('wp', expect.stringContaining('wp-cli'), ctx.log);
    expect(execMock).toHaveBeenNthCalledWith(1, 'wp', ['package', 'list', '--fields=name', '--format=csv'], {
      log: ctx.log,
      throwOnNonZero: false,
    });
    expect(execMock).toHaveBeenNthCalledWith(2, 'wp', ['package', 'install', 'wp-cli/dist-archive-command'], {
      log: ctx.log,
      throwOnNonZero: true,
    });
    expect(execMock).toHaveBeenNthCalledWith(3, 'wp', [
      'dist-archive',
      join(projectDir, 'plugins/acme-widgets'),
      join(outDir, 'acme-widgets-1.2.3.zip'),
      '--format=zip',
    ], {
      cwd: projectDir,
      log: ctx.log,
      throwOnNonZero: true,
    });
    expect(result).toEqual({ artifact: join(outDir, 'acme-widgets-1.2.3.zip') });
  });

  it('skips the package install when dist-archive is already available', async () => {
    const outDir = await tempDir('sh1pt-wp-out-');
    const projectDir = await tempDir('sh1pt-wp-project-');

    execMock.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'name\nwp-cli/dist-archive-command\n',
      stderr: '',
    });

    await adapter.build(fakeBuildContext({
      outDir,
      projectDir,
      version: '1.2.3',
      dryRun: false,
    }) as any, sampleConfig);

    expect(execMock).toHaveBeenCalledTimes(2);
    expect(execMock.mock.calls[1]?.[1]?.[0]).toBe('dist-archive');
  });

  it('rejects unsupported extension types', async () => {
    await expect(adapter.build(fakeBuildContext({ dryRun: true }) as any, {
      ...sampleConfig,
      type: 'mu-plugin',
    } as any)).rejects.toThrow('deploy-wordpress type must be one of: plugin, theme');
  });

  it('keeps dry-run shipping side-effect free and target-free', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: true,
    }) as any, { slug: 'acme-widgets' })).resolves.toEqual({ id: 'dry-run' });

    expect(execMock).not.toHaveBeenCalled();
  });

  it('refuses to ship when neither ssh nor path names an install', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: false,
    }) as any, { slug: 'acme-widgets' })).rejects.toThrow('deploy-wordpress requires ssh or path');

    expect(execMock).not.toHaveBeenCalled();
  });

  it('installs and activates over wp-cli, reporting the version the site ended up on', async () => {
    execMock
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '1.2.3\n', stderr: '' });

    const ctx = fakeShipContext({
      version: '1.2.3',
      dryRun: false,
      artifact: '/repo/.sh1pt/out/acme-widgets-1.2.3.zip',
    });
    const result = await adapter.ship(ctx as any, sampleConfig);

    expect(execMock).toHaveBeenNthCalledWith(1, 'wp', [
      'plugin',
      'install',
      '/repo/.sh1pt/out/acme-widgets-1.2.3.zip',
      '--force',
      '--activate',
      '--ssh=deploy@example.com:/var/www/html',
    ], { log: ctx.log, throwOnNonZero: true });
    expect(execMock).toHaveBeenNthCalledWith(2, 'wp', [
      'plugin',
      'get',
      'acme-widgets',
      '--field=version',
      '--ssh=deploy@example.com:/var/www/html',
    ], { log: ctx.log, throwOnNonZero: false });
    expect(result).toEqual({ id: 'acme-widgets@1.2.3', url: 'https://example.com' });
  });

  it('ships themes without activating when activate is false', async () => {
    const ctx = fakeShipContext({
      version: '2.0.0',
      dryRun: false,
      artifact: '/repo/.sh1pt/out/acme-theme-2.0.0.zip',
    });

    await adapter.ship(ctx as any, {
      slug: 'acme-theme',
      type: 'theme',
      path: '/var/www/html',
      activate: false,
    });

    expect(execMock).toHaveBeenNthCalledWith(1, 'wp', [
      'theme',
      'install',
      '/repo/.sh1pt/out/acme-theme-2.0.0.zip',
      '--force',
      '--path=/var/www/html',
    ], { log: ctx.log, throwOnNonZero: true });
  });

  it('falls back to the build version when wp-cli cannot report one', async () => {
    execMock
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 1, stdout: "Error: The 'acme-widgets' plugin could not be found.", stderr: '' });

    const result = await adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: false,
      artifact: '/repo/.sh1pt/out/acme-widgets-1.2.3.zip',
    }) as any, sampleConfig);

    expect(result.id).toBe('acme-widgets@1.2.3');
  });

  it('reports live status with the site URL', async () => {
    await expect(adapter.status?.('acme-widgets@1.2.3', sampleConfig)).resolves.toEqual({
      state: 'live',
      version: '1.2.3',
      url: 'https://example.com',
    });
  });
});
