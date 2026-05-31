import { contractTestTarget, fakeBuildContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'web', requireKind: true });

const sampleConfig = {
  manifestPath: 'manifest.json',
  startUrl: '/app',
  scope: '/app/',
  publicUrl: 'https://example.com',
};

contractTestTarget(adapter, { sampleConfig });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('web-pwa target', () => {
  it('writes installable PWA assets and returns the artifact directory', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-pwa-project-'));
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-pwa-out-'));
    tempDirs.push(projectDir, outDir);
    await writeFile(join(projectDir, 'manifest.json'), JSON.stringify({ name: 'Acme App' }), 'utf-8');

    const result = await adapter.build(fakeBuildContext({
      projectDir,
      outDir,
      version: '1.2.3',
      channel: 'stable',
    }) as any, sampleConfig);

    expect(result.artifact).toBe(join(outDir, 'web-pwa'));
    const manifest = JSON.parse(await readFile(join(result.artifact, 'manifest.webmanifest'), 'utf-8'));
    expect(manifest).toMatchObject({
      name: 'Acme App',
      start_url: '/app',
      scope: '/app/',
      display: 'standalone',
    });
    await expect(readFile(join(result.artifact, 'service-worker.js'), 'utf-8')).resolves.toContain('fetch');
    await expect(readFile(join(result.artifact, 'index.html'), 'utf-8')).resolves.toContain('manifest.webmanifest');
    const summary = JSON.parse(await readFile(join(result.artifact, 'pwa-package.json'), 'utf-8'));
    expect(summary.files).toEqual(['index.html', 'manifest.webmanifest', 'service-worker.js']);
  });

  it('copies configured icons into the artifact and includes them in the summary', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-pwa-project-'));
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-pwa-out-'));
    tempDirs.push(projectDir, outDir);
    await writeFile(join(projectDir, 'manifest.json'), JSON.stringify({
      name: 'Icon App',
      icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    }), 'utf-8');
    await mkdir(join(projectDir, 'public', 'icons'), { recursive: true });
    await writeFile(join(projectDir, 'public', 'icons', 'icon-192.png'), 'fake-png', 'utf-8');

    const result = await adapter.build(fakeBuildContext({
      projectDir,
      outDir,
      version: '1.2.3',
      channel: 'stable',
    }) as any, { ...sampleConfig, iconsDir: 'public/icons' });

    await expect(readFile(join(result.artifact, 'icons', 'icon-192.png'), 'utf-8')).resolves.toBe('fake-png');
    const summary = JSON.parse(await readFile(join(result.artifact, 'pwa-package.json'), 'utf-8'));
    expect(summary.files).toContain('icons');
  });

  it('writes a default service worker with cache-backed offline fallback', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-pwa-project-'));
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-pwa-out-'));
    tempDirs.push(projectDir, outDir);
    await writeFile(join(projectDir, 'manifest.json'), JSON.stringify({ name: 'Offline App' }), 'utf-8');

    const result = await adapter.build(fakeBuildContext({
      projectDir,
      outDir,
      version: '1.2.3',
      channel: 'stable',
    }) as any, sampleConfig);

    const serviceWorker = await readFile(join(result.artifact, 'service-worker.js'), 'utf-8');
    expect(serviceWorker).toContain("caches.open(CACHE_NAME)");
    expect(serviceWorker).toContain("caches.match(OFFLINE_URL)");
    expect(serviceWorker).toContain("event.respondWith");
  });

  it('returns absolute ship and status URLs when publicUrl is configured', async () => {
    const ship = await adapter.ship(fakeBuildContext({ version: '1.2.3', dryRun: false }) as any, sampleConfig);
    expect(ship).toMatchObject({
      id: 'https://example.com/app',
      url: 'https://example.com/app',
    });
    expect(adapter.status).toBeDefined();
    await expect(adapter.status!('https://example.com/app', sampleConfig)).resolves.toMatchObject({
      state: 'live',
      url: 'https://example.com/app',
    });
  });
});
