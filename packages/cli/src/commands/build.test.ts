import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { detectStack, cloneAndDetect } from './build.js';
import type { ResolvedInput } from '../input.js';

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

// ---------------------------------------------------------------------------
// cloneAndDetect
// ---------------------------------------------------------------------------

describe('cloneAndDetect', () => {
  let tempDir: string;
  let sourceDir: string;

  /**
   * Create a minimal git repo that can be cloned via local path.
   * Returns the path to the repo.
   */
  function createLocalGitRepo(name: string): string {
    const repo = join(tempDir, name);
    mkdirSync(repo, { recursive: true });
    writeFileSync(join(repo, 'package.json'), JSON.stringify({
      name,
      version: '1.0.0',
    }));
    execSync('git init', { cwd: repo });
    execSync('git add .', { cwd: repo });
    execSync('git commit -m "init"', { cwd: repo, env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@test.com' } });
    return repo;
  }

  function makeTempDir(): string {
    tempDir = mkdtempSync(join(tmpdir(), 'sh1pt-clone-test-'));
    return tempDir;
  }

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = '' as string;
    }
    if (sourceDir) {
      rmSync(sourceDir, { recursive: true, force: true });
      sourceDir = '' as string;
    }
  });

  it('clones a git repo and detects the stack', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'sh1pt-clone-test-'));
    const repoPath = createLocalGitRepo('my-clonable-app');
    sourceDir = repoPath;

    const input: ResolvedInput = {
      kind: 'git',
      raw: repoPath,
      value: repoPath,
      inferredName: 'my-clonable-app',
    };

    const result = cloneAndDetect(input);

    expect(result.stack).toBeDefined();
    expect(result.stack!.runtime).toBe('node');
    expect(result.stack!.projectName).toBe('my-clonable-app');
    expect(result.projectName).toBe('my-clonable-app');
    expect(result.cloneDir).toContain('sh1pt-build-');
    expect(existsSync(result.cloneDir)).toBe(true);

    // Clean up cloned dir
    rmSync(result.cloneDir, { recursive: true, force: true });
  });

  it('clones a Python repo and detects python stack', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'sh1pt-clone-test-'));
    const repoPath = join(tempDir, 'py-app');
    mkdirSync(repoPath, { recursive: true });
    writeFileSync(join(repoPath, 'pyproject.toml'), '[project]\nname = "py-cloned"\nversion = "0.1.0"\n');
    execSync('git init', { cwd: repoPath });
    execSync('git add .', { cwd: repoPath });
    execSync('git commit -m "init"', { cwd: repoPath, env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@test.com' } });
    sourceDir = repoPath;

    const input: ResolvedInput = {
      kind: 'git',
      raw: repoPath,
      value: repoPath,
      inferredName: 'py-app',
    };

    const result = cloneAndDetect(input);

    expect(result.stack).toBeDefined();
    expect(result.stack!.runtime).toBe('python');
    expect(result.projectName).toBe('py-cloned');

    rmSync(result.cloneDir, { recursive: true, force: true });
  });

  it('throws on invalid git URL', () => {
    const input: ResolvedInput = {
      kind: 'git',
      raw: 'https://github.com/nonexistent-org-xyzzy/repo-that-does-not-exist.git',
      value: 'https://github.com/nonexistent-org-xyzzy/repo-that-does-not-exist.git',
      inferredName: 'repo-that-does-not-exist',
    };

    expect(() => cloneAndDetect(input)).toThrow('git clone failed');
  });

  it('uses inferredName as projectName when stack detection returns no name', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'sh1pt-clone-test-'));
    // Create a git repo with no recognizable manifest
    const repoPath = join(tempDir, 'unknown-project');
    mkdirSync(repoPath, { recursive: true });
    writeFileSync(join(repoPath, 'README.md'), '# Hello');
    execSync('git init', { cwd: repoPath });
    execSync('git add .', { cwd: repoPath });
    execSync('git commit -m "init"', { cwd: repoPath, env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@test.com' } });
    sourceDir = repoPath;

    const input: ResolvedInput = {
      kind: 'git',
      raw: repoPath,
      value: repoPath,
      inferredName: 'unknown-project',
    };

    const result = cloneAndDetect(input);

    expect(result.stack).toBeUndefined();
    expect(result.projectName).toBe('unknown-project');

    rmSync(result.cloneDir, { recursive: true, force: true });
  });

  it('generates unique clone directory names', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'sh1pt-clone-test-'));
    const repoPath = createLocalGitRepo('uniq-app');
    sourceDir = repoPath;

    const input: ResolvedInput = {
      kind: 'git',
      raw: repoPath,
      value: repoPath,
      inferredName: 'uniq-app',
    };

    const result1 = cloneAndDetect(input);
    const result2 = cloneAndDetect(input);

    // Each call should produce a unique temp directory
    expect(result1.cloneDir).not.toBe(result2.cloneDir);

    // Cleanup
    rmSync(result1.cloneDir, { recursive: true, force: true });
    rmSync(result2.cloneDir, { recursive: true, force: true });
  });
});
