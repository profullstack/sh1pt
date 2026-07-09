import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'pkg', requireKind: true });

const tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('CDN package target', () => {
  it('writes a manifest with resolved CDN mirror URLs', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-cdn-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: '1.2.3',
    }) as any, {
      packageName: '@acme/ui',
      mirrors: ['jsdelivr', 'unpkg', 'cdnjs', 'jsdelivr'],
      cdnjs: {
        autoupdateSource: 'npm',
        libraryName: 'acme-ui',
        sourceRepo: 'https://github.com/acme/ui',
      },
    });

    expect(result.artifact).toBe(join(outDir, 'cdn-manifest.json'));
    expect(result.meta).toEqual({
      urls: [
        'https://cdn.jsdelivr.net/npm/@acme/ui@1.2.3/',
        'https://unpkg.com/@acme/ui@1.2.3/',
        'https://cdnjs.cloudflare.com/ajax/libs/acme-ui/1.2.3/',
      ],
    });

    const manifest = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(manifest).toMatchObject({
      provider: 'pkg-cdn',
      packageName: '@acme/ui',
      version: '1.2.3',
      cdnjs: {
        libraryName: 'acme-ui',
        autoupdateSource: 'npm',
        sourceRepo: 'https://github.com/acme/ui',
        requiresManualSubmission: true,
      },
    });
    expect(manifest.mirrors).toEqual([
      {
        mirror: 'jsdelivr',
        url: 'https://cdn.jsdelivr.net/npm/@acme/ui@1.2.3/',
        source: 'npm',
        autoMirrored: true,
      },
      {
        mirror: 'unpkg',
        url: 'https://unpkg.com/@acme/ui@1.2.3/',
        source: 'npm',
        autoMirrored: true,
      },
      {
        mirror: 'cdnjs',
        url: 'https://cdnjs.cloudflare.com/ajax/libs/acme-ui/1.2.3/',
        source: 'manual',
        autoMirrored: false,
      },
    ]);
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      packageName: 'my-lib',
      mirrors: ['esm.sh', 'jspm'],
    })).resolves.toEqual({
      id: 'dry-run',
      meta: {
        urls: [
          'https://esm.sh/my-lib@1.2.3',
          'https://ga.jspm.io/npm:my-lib@1.2.3/',
        ],
        mirrors: [
          {
            mirror: 'esm.sh',
            url: 'https://esm.sh/my-lib@1.2.3',
            source: 'npm',
            autoMirrored: true,
          },
          {
            mirror: 'jspm',
            url: 'https://ga.jspm.io/npm:my-lib@1.2.3/',
            source: 'npm',
            autoMirrored: true,
          },
        ],
      },
    });
  });

  it('checks CDN URLs before reporting a real shipment', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: false, status: 405 })
      .mockResolvedValueOnce({ ok: true, status: 206 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: false,
    }) as any, {
      packageName: 'my-lib',
      mirrors: ['jsdelivr', 'skypack'],
    })).resolves.toEqual({
      id: 'my-lib@1.2.3',
      url: 'https://cdn.jsdelivr.net/npm/my-lib@1.2.3/',
      meta: {
        urls: [
          'https://cdn.jsdelivr.net/npm/my-lib@1.2.3/',
          'https://cdn.skypack.dev/my-lib@1.2.3',
        ],
        mirrors: [
          {
            mirror: 'jsdelivr',
            url: 'https://cdn.jsdelivr.net/npm/my-lib@1.2.3/',
            source: 'npm',
            autoMirrored: true,
          },
          {
            mirror: 'skypack',
            url: 'https://cdn.skypack.dev/my-lib@1.2.3',
            source: 'npm',
            autoMirrored: true,
          },
        ],
        checks: [
          {
            mirror: 'jsdelivr',
            url: 'https://cdn.jsdelivr.net/npm/my-lib@1.2.3/',
            ok: true,
            status: 200,
            method: 'HEAD',
          },
          {
            mirror: 'skypack',
            url: 'https://cdn.skypack.dev/my-lib@1.2.3',
            ok: true,
            status: 206,
            method: 'GET',
          },
        ],
      },
    });
    expect(fetchMock).toHaveBeenCalledWith('https://cdn.jsdelivr.net/npm/my-lib@1.2.3/', {
      method: 'HEAD',
      redirect: 'follow',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://cdn.skypack.dev/my-lib@1.2.3', {
      method: 'GET',
      headers: { range: 'bytes=0-0' },
      redirect: 'follow',
    });
  });

  it('fails real shipments when a mirror does not resolve', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: false,
    }) as any, {
      packageName: 'missing-lib',
      mirrors: ['unpkg'],
    })).rejects.toThrow('CDN mirror checks failed: unpkg HEAD 404 https://unpkg.com/missing-lib@1.2.3/');
  });

  it('rejects unsupported mirror names with a clear error', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      packageName: 'my-lib',
      mirrors: ['made-up-cdn'],
    } as any)).rejects.toThrow('pkg-cdn unsupported mirror: made-up-cdn');
  });
});
