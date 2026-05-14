import { fakeBuildContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'desktop', requireKind: true });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Windows desktop target', () => {
  it('writes a dry-run package plan for Store and MSI artifacts', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-win-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: '1.2.3',
    }) as any, {
      appId: 'Acme.MyApp',
      publisherId: 'CN=12345678-90ab-cdef-1234-567890abcdef',
      distribution: 'both',
      architectures: ['x64'],
    });

    expect(result.artifact).toBe(join(outDir, 'windows-package-plan.json'));
    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan).toMatchObject({
      provider: 'windows-desktop',
      appId: 'Acme.MyApp',
      publisherId: 'CN=12345678-90ab-cdef-1234-567890abcdef',
      version: '1.2.3',
      distribution: 'both',
      architectures: ['x64'],
      artifacts: [
        { kind: 'msixbundle', path: join(outDir, 'app.msixbundle') },
        { kind: 'msi', path: join(outDir, 'app.msi') },
      ],
      followUp: ['signingCertThumbprint is required before signing Windows artifacts'],
    });
    expect(plan.commands).toEqual([
      ['makeappx', 'pack', '/d', join(outDir, 'windows-unpacked'), '/p', join(outDir, 'app.msixbundle')],
      ['wix', 'build', join(outDir, 'windows-unpacked', 'Product.wxs'), '-out', join(outDir, 'app.msi')],
    ]);
  });

  it('includes signtool commands when a signing certificate thumbprint is configured', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-win-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: '1.2.3',
    }) as any, {
      appId: 'Acme.MyApp',
      publisherId: 'CN=12345678-90ab-cdef-1234-567890abcdef',
      distribution: 'msstore',
      signingCertThumbprint: 'ABC123',
    });

    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan.followUp).toEqual([]);
    expect(plan.commands).toContainEqual([
      'signtool',
      'sign',
      '/sha1',
      'ABC123',
      '/fd',
      'SHA256',
      join(outDir, 'app.msixbundle'),
    ]);
  });
});
