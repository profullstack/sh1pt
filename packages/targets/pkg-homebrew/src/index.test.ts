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

describe('Homebrew formula generation', () => {
  it('writes a platform-aware formula for binary releases', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-homebrew-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: '1.2.3',
    }) as any, {
      tap: 'acme/homebrew-tools',
      formulaName: 'my-tool',
      desc: 'Acme command-line tool',
      homepage: 'https://example.com/my-tool',
      license: 'MIT',
      binaryName: 'my-tool',
      binaries: [
        {
          platform: 'darwin-arm64',
          url: 'https://downloads.example.com/my-tool-1.2.3-darwin-arm64.tar.gz',
          sha256: 'a'.repeat(64),
        },
        {
          platform: 'linux-x64',
          url: 'https://downloads.example.com/my-tool-1.2.3-linux-x64.tar.gz',
          sha256: 'b'.repeat(64),
        },
      ],
    });

    expect(result.artifact).toBe(join(outDir, 'my-tool.rb'));
    const formula = await readFile(result.artifact, 'utf-8');

    expect(formula).toContain('class MyTool < Formula');
    expect(formula).toContain('desc "Acme command-line tool"');
    expect(formula).toContain('version "1.2.3"');
    expect(formula).toContain('license "MIT"');
    expect(formula).toContain('on_macos do');
    expect(formula).toContain('if Hardware::CPU.arm?');
    expect(formula).toContain('on_linux do');
    expect(formula).toContain('if Hardware::CPU.intel?');
    expect(formula).toContain('bin.install "my-tool"');
    expect(formula).toContain('system "#{bin}/my-tool", "--version"');
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({
      version: '1.2.3',
      dryRun: true,
    }) as any, {
      tap: 'acme/homebrew-tools',
      formulaName: 'my-tool',
      binaries: [
        {
          platform: 'darwin-x64',
          url: 'https://downloads.example.com/my-tool-1.2.3-darwin-x64.tar.gz',
          sha256: 'c'.repeat(64),
        },
      ],
    })).resolves.toEqual({ id: 'dry-run' });
  });
});
