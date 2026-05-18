import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectStack } from './build.js';

describe('detectStack', () => {
  let tempDir: string;

  function makeTempDir(): string {
    tempDir = mkdtempSync(join(tmpdir(), 'sh1pt-test-'));
    return tempDir;
  }

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('detects a Node.js project from package.json', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'my-node-app',
      version: '1.0.0',
    }));
    const result = detectStack(dir);
    expect(result).toBeDefined();
    expect(result!.runtime).toBe('node');
    expect(result!.projectName).toBe('my-node-app');
    expect(result!.packageManager).toBe('npm');
  });

  it('detects pnpm from pnpm-lock.yaml', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'pnpm-app' }));
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
    const result = detectStack(dir);
    expect(result!.packageManager).toBe('pnpm');
  });

  it('detects yarn from yarn.lock', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'yarn-app' }));
    writeFileSync(join(dir, 'yarn.lock'), '');
    const result = detectStack(dir);
    expect(result!.packageManager).toBe('yarn');
  });

  it('detects packageManager field in package.json', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'pm-field',
      packageManager: 'pnpm@9.0.0',
    }));
    const result = detectStack(dir);
    expect(result!.packageManager).toBe('pnpm');
  });

  it('detects a Python project from pyproject.toml', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'pyproject.toml'), `[project]\nname = "my-python-pkg"\nversion = "0.1.0"\n`);
    const result = detectStack(dir);
    expect(result).toBeDefined();
    expect(result!.runtime).toBe('python');
    expect(result!.projectName).toBe('my-python-pkg');
    expect(result!.packageManager).toBe('pip');
  });

  it('detects poetry from pyproject.toml', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'pyproject.toml'), `[tool.poetry]\nname = "poetry-app"\nversion = "1.0.0"\n`);
    const result = detectStack(dir);
    expect(result!.runtime).toBe('python');
    expect(result!.packageManager).toBe('poetry');
  });

  it('detects a Rust project from Cargo.toml', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'Cargo.toml'), `[package]\nname = "my-rust-crate"\nversion = "0.1.0"\n`);
    const result = detectStack(dir);
    expect(result).toBeDefined();
    expect(result!.runtime).toBe('rust');
    expect(result!.projectName).toBe('my-rust-crate');
    expect(result!.packageManager).toBe('cargo');
  });

  it('detects a Go project from go.mod', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'go.mod'), `module github.com/user/my-go-app\n\ngo 1.21\n`);
    const result = detectStack(dir);
    expect(result).toBeDefined();
    expect(result!.runtime).toBe('go');
    expect(result!.projectName).toBe('my-go-app');
    expect(result!.packageManager).toBe('go');
  });

  it('returns undefined for an empty directory', () => {
    const dir = makeTempDir();
    const result = detectStack(dir);
    expect(result).toBeUndefined();
  });

  it('prefers package.json over other manifests when multiple exist', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'multi' }));
    writeFileSync(join(dir, 'go.mod'), 'module example.com/go\n');
    const result = detectStack(dir);
    expect(result!.runtime).toBe('node');
  });
});
