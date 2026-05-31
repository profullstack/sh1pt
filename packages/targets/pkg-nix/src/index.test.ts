import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'pkg', requireKind: true });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('nix package expression generation', () => {
  it('writes a default.nix with source, build inputs, install phase, and meta', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-nix-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: 'v1.2.3',
    }) as any, {
      pname: 'myapp',
      sourceRepo: 'acme/myapp',
      rev: 'release-1.2.3',
      sha256: 'sha256-abc123',
      description: 'Example command line app',
      homepage: 'https://example.com/myapp',
      license: 'licenses.asl20',
      platforms: 'platforms.linux',
      mainProgram: 'myapp',
      maintainerHandle: 'photon101',
      nativeBuildInputs: ['pkg-config', 'makeWrapper'],
      buildInputs: ['openssl', 'zlib'],
      installPhase: [
        'runHook preInstall',
        'install -Dm755 myapp $out/bin/myapp',
        'runHook postInstall',
      ].join('\n'),
    });

    expect(result.artifact).toBe(join(outDir, 'default.nix'));

    const expression = await readFile(join(outDir, 'default.nix'), 'utf-8');
    expect(expression).toContain('{ lib, stdenv, fetchFromGitHub }:');
    expect(expression).toContain('pname = "myapp";');
    expect(expression).toContain('version = "1.2.3";');
    expect(expression).toContain('owner = "acme";');
    expect(expression).toContain('repo = "myapp";');
    expect(expression).toContain('rev = "release-1.2.3";');
    expect(expression).toContain('hash = "sha256-abc123";');
    expect(expression).toContain('nativeBuildInputs = [ pkg-config makeWrapper ];');
    expect(expression).toContain('buildInputs = [ openssl zlib ];');
    expect(expression).toContain('install -Dm755 myapp $out/bin/myapp');
    expect(expression).toContain('description = "Example command line app";');
    expect(expression).toContain('homepage = "https://example.com/myapp";');
    expect(expression).toContain('license = licenses.asl20;');
    expect(expression).toContain('platforms = platforms.linux;');
    expect(expression).toContain('mainProgram = "myapp";');
    expect(expression).toContain('maintainers = with maintainers; [ photon101 ];');
  });

  it('accepts GitHub URLs for sourceRepo', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-nix-'));
    tempDirs.push(outDir);

    await adapter.build(fakeBuildContext({
      outDir,
      version: '1.2.3',
    }) as any, {
      pname: 'myapp',
      sourceRepo: 'https://github.com/acme/myapp.git?tab=readme-ov-file#usage',
    });

    const expression = await readFile(join(outDir, 'default.nix'), 'utf-8');
    expect(expression).toContain('owner = "acme";');
    expect(expression).toContain('repo = "myapp";');
  });

  it('rejects malformed sourceRepo values', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-nix-'));
    tempDirs.push(outDir);

    await expect(adapter.build(fakeBuildContext({
      outDir,
      version: '1.2.3',
    }) as any, {
      pname: 'myapp',
      sourceRepo: 'acme',
    })).rejects.toThrow('sourceRepo');
  });

  it('rejects non-GitHub sourceRepo URLs', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-nix-'));
    tempDirs.push(outDir);

    await expect(adapter.build(fakeBuildContext({
      outDir,
      version: '1.2.3',
    }) as any, {
      pname: 'myapp',
      sourceRepo: 'https://gitlab.com/acme/myapp',
    })).rejects.toThrow('sourceRepo');
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      pname: 'myapp',
    })).resolves.toEqual({ id: 'dry-run' });
  });
});
