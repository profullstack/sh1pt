import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'tv', requireKind: true });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('webOS TV target', () => {
  it('validates appinfo.json and writes a package plan', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-webos-project-'));
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-webos-out-'));
    tempDirs.push(projectDir, outDir);
    await mkdir(join(projectDir, 'webos'), { recursive: true });
    await writeFile(join(projectDir, 'webos', 'index.html'), '<main></main>\n', 'utf-8');
    await writeFile(join(projectDir, 'webos', 'icon.png'), 'png', 'utf-8');
    await writeFile(join(projectDir, 'webos', 'appinfo.json'), JSON.stringify({
      id: 'com.acme.tv',
      version: '1.2.3',
      title: 'Acme TV',
      vendor: 'Acme',
      main: 'index.html',
      icon: 'icon.png',
      type: 'web',
    }), 'utf-8');

    const result = await adapter.build(fakeBuildContext({
      projectDir,
      outDir,
      version: '1.2.3',
    }) as any, {
      appId: 'com.acme.tv',
      sourceDir: 'webos',
      submission: 'developer-mode',
      deviceName: 'living-room',
    });

    expect(result.artifact).toBe(join(outDir, 'webos-package-plan.json'));
    expect(result.meta).toEqual({
      expectedPackage: join(outDir, 'com.acme.tv_1.2.3.ipk'),
      command: ['ares-package', '-o', outDir, join(projectDir, 'webos')],
    });
    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan).toMatchObject({
      provider: 'webos',
      appId: 'com.acme.tv',
      title: 'Acme TV',
      version: '1.2.3',
      sourceDir: join(projectDir, 'webos'),
      submission: 'developer-mode',
      deviceName: 'living-room',
      expectedPackage: join(outDir, 'com.acme.tv_1.2.3.ipk'),
      command: ['ares-package', '-o', outDir, join(projectDir, 'webos')],
      installCommand: ['ares-install', '--device', 'living-room', join(outDir, 'com.acme.tv_1.2.3.ipk')],
    });
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
    }) as any, {
      appId: 'com.acme.tv',
      sourceDir: 'webos',
      submission: 'lg-content-store',
      developerId: 'seller-123',
    })).resolves.toEqual({
      id: 'dry-run',
      meta: {
        submission: 'lg-content-store',
      },
    });
  });

  it('returns package metadata in real ship mode', async () => {
    await expect(adapter.ship(fakeShipContext({
      artifact: '/repo/.sh1pt/out/webos-package-plan.json',
      version: '1.2.3',
      dryRun: false,
    }) as any, {
      appId: 'com.acme.tv',
      sourceDir: 'webos',
      submission: 'developer-mode',
      deviceName: 'living-room',
    })).resolves.toEqual({
      id: 'com.acme.tv@1.2.3',
      meta: {
        artifact: '/repo/.sh1pt/out/webos-package-plan.json',
        submission: 'developer-mode',
        developerId: undefined,
        deviceName: 'living-room',
      },
    });
  });

  it('rejects appinfo.json that does not match the configured app id', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-webos-project-'));
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-webos-out-'));
    tempDirs.push(projectDir, outDir);
    await mkdir(join(projectDir, 'webos'), { recursive: true });
    await writeFile(join(projectDir, 'webos', 'index.html'), '<main></main>\n', 'utf-8');
    await writeFile(join(projectDir, 'webos', 'appinfo.json'), JSON.stringify({
      id: 'com.other.tv',
      version: '1.2.3',
      title: 'Other TV',
      main: 'index.html',
    }), 'utf-8');

    await expect(adapter.build(fakeBuildContext({
      projectDir,
      outDir,
    }) as any, {
      appId: 'com.acme.tv',
      sourceDir: 'webos',
      submission: 'developer-mode',
    })).rejects.toThrow('webOS appinfo.json id must match appId');
  });
});
