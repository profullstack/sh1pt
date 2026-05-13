import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'web', requireKind: true });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('static web target', () => {
  it('copies a prebuilt site into the output directory and writes a manifest', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-web-project-'));
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-web-out-'));
    tempDirs.push(projectDir, outDir);
    await mkdir(join(projectDir, 'dist', 'assets'), { recursive: true });
    await writeFile(join(projectDir, 'dist', 'index.html'), '<h1>Hello</h1>\n', 'utf-8');
    await writeFile(join(projectDir, 'dist', 'assets', 'app.js'), 'console.log("hi");\n', 'utf-8');

    const result = await adapter.build(fakeBuildContext({
      projectDir,
      outDir,
      version: '1.2.3',
    }) as any, {
      dir: 'dist',
      provider: 'cloudflare-pages',
      project: 'site',
      domain: 'example.com',
    });

    expect(result.artifact).toBe(join(outDir, 'static'));
    expect(result.meta).toEqual({
      files: 2,
      manifest: join(outDir, 'web-static-manifest.json'),
    });
    await expect(readFile(join(outDir, 'static', 'index.html'), 'utf-8')).resolves.toBe('<h1>Hello</h1>\n');
    await expect(readFile(join(outDir, 'static', 'assets', 'app.js'), 'utf-8')).resolves.toBe('console.log("hi");\n');

    const manifest = JSON.parse(await readFile(join(outDir, 'web-static-manifest.json'), 'utf-8'));
    expect(manifest).toMatchObject({
      provider: 'cloudflare-pages',
      project: 'site',
      domain: 'example.com',
      artifact: join(outDir, 'static'),
      version: '1.2.3',
      files: ['assets/app.js', 'index.html'],
    });
  });

  it('keeps dry-run shipping side-effect free with provider metadata', async () => {
    await expect(adapter.ship(fakeShipContext({
      artifact: '/repo/.sh1pt/out/static',
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      dir: 'dist',
      provider: 'netlify',
      project: 'docs',
      domain: 'docs.example.com',
    })).resolves.toEqual({
      id: 'dry-run',
      url: 'https://docs.example.com',
      meta: {
        provider: 'netlify',
        project: 'docs',
      },
    });
  });

  it('returns the staged artifact and production URL in real ship mode', async () => {
    await expect(adapter.ship(fakeShipContext({
      artifact: '/repo/.sh1pt/out/static',
      version: '1.2.3',
      dryRun: false,
    }) as any, {
      dir: 'dist',
      provider: 's3-cloudfront',
      project: 'site',
      domain: 'example.com',
    })).resolves.toEqual({
      id: 's3-cloudfront:1.2.3',
      url: 'https://example.com',
      meta: {
        artifact: '/repo/.sh1pt/out/static',
        provider: 's3-cloudfront',
        project: 'site',
      },
    });
  });

  it('requires an existing source directory', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'sh1pt-web-project-'));
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-web-out-'));
    tempDirs.push(projectDir, outDir);

    await expect(adapter.build(fakeBuildContext({
      projectDir,
      outDir,
    }) as any, {
      dir: 'missing',
      provider: 'vercel',
    })).rejects.toThrow('ENOENT');
  });
});
