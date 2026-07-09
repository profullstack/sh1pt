import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
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

describe('Windows desktop package planning', () => {
  it('writes a dry-run plan for Microsoft Store and MSI outputs', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-desktop-win-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: '2.4.6',
      dryRun: true,
    }) as any, {
      appId: 'Acme.MyApp',
      publisherId: 'CN=12345678-90ab-cdef',
      distribution: 'both',
      signingCertThumbprint: 'ABCDEF123456',
      architectures: ['x64', 'arm64'],
    });

    expect(result.artifact).toBe(join(outDir, 'windows', 'Acme.MyApp-2.4.6.package-plan.json'));

    const plan = JSON.parse(await readFile(result.artifact, 'utf8')) as {
      appId: string;
      publisherId: string;
      version: string;
      distribution: string;
      architectures: string[];
      artifacts: Array<{ kind: string; path: string }>;
      commands: Array<{ tool: string; args: string[]; needsSigningCert: boolean }>;
    };

    expect(plan).toMatchObject({
      appId: 'Acme.MyApp',
      publisherId: 'CN=12345678-90ab-cdef',
      version: '2.4.6',
      distribution: 'both',
      architectures: ['x64', 'arm64'],
    });
    expect(plan.artifacts).toEqual([
      { kind: 'msixbundle', path: join(outDir, 'windows', 'Acme.MyApp-2.4.6.msixbundle') },
      { kind: 'msi', path: join(outDir, 'windows', 'Acme.MyApp-2.4.6.msi') },
    ]);
    expect(plan.commands.map((command) => command.tool)).toEqual(['makeappx', 'signtool', 'wix', 'signtool']);
    expect(plan.commands.every((command) => command.args.includes('ABCDEF123456') || command.tool !== 'signtool')).toBe(true);
    expect(plan.commands.every((command) => command.needsSigningCert === false)).toBe(true);
  });

  it('marks signing cert follow-up when no thumbprint is configured', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-desktop-win-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: '1.0.0',
      dryRun: true,
    }) as any, {
      appId: 'Acme.Tool',
      publisherId: 'CN=publisher',
      distribution: 'msi',
    });

    const plan = JSON.parse(await readFile(result.artifact, 'utf8')) as {
      artifacts: Array<{ kind: string; path: string }>;
      commands: Array<{ tool: string; args: string[]; needsSigningCert: boolean }>;
    };

    expect(plan.artifacts).toEqual([
      { kind: 'msi', path: join(outDir, 'windows', 'Acme.Tool-1.0.0.msi') },
    ]);
    const signCommand = plan.commands.find((command) => command.tool === 'signtool');
    expect(signCommand?.needsSigningCert).toBe(true);
    expect(signCommand?.args).toContain('<certificate-thumbprint>');
  });

  it('rejects unsupported distributions while building', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-desktop-win-'));
    tempDirs.push(outDir);

    await expect(adapter.build(fakeBuildContext({
      outDir,
      version: '1.0.0',
      dryRun: true,
    }) as any, {
      appId: 'Acme.Tool',
      publisherId: 'CN=publisher',
      distribution: 'preview',
    } as any)).rejects.toThrow('desktop-win distribution must be one of: msstore, msi, both');
  });

  it('rejects unsupported distributions while shipping', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '1.0.0',
      dryRun: true,
    }) as any, {
      appId: 'Acme.Tool',
      publisherId: 'CN=publisher',
      distribution: 'preview',
    } as any)).rejects.toThrow('desktop-win distribution must be one of: msstore, msi, both');
  });
});
