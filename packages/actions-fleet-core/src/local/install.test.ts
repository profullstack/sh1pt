import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planDiff } from '../diff/plan.js';
import { installPlan } from './install.js';
import type { RenderResult } from '../action-pack/render.js';

function bodyHash(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

function makeRender(destination: string, content: string, hash: string): RenderResult {
  return {
    packId: 'test-pack',
    packVersion: '1.0.0',
    files: [
      {
        source: 'ci.yml.hbs',
        destination,
        mergeStrategy: 'replace-managed',
        content,
        hash,
      },
    ],
  };
}

function withHeader(hash: string, body: string): string {
  // Mirror the real renderer: single-newline header, body straight after the
  // '# hash:' line (no blank line between header and body).
  return [
    '# Managed by sh1pt Actions Fleet',
    '# pack: test-pack@1.0.0',
    '# install: sh1pt-actions-store',
    `# hash: sha256:${hash}`,
    '',
  ].join('\n') + body;
}

describe('installPlan', () => {
  const body = 'name: CI\n';
  const hash = bodyHash(body);
  const newContent = withHeader(hash, body);

  it('writes a new file when status is create', async () => {
    const repoDir = await mkdtemp(join(tmpdir(), 'sh1pt-install-'));
    try {
      const plan = await planDiff({
        repoDir,
        render: makeRender('.github/workflows/ci.yml', newContent, hash),
      });
      const result = await installPlan(plan);
      expect(result.files[0]?.action).toBe('created');
      const onDisk = await readFile(join(repoDir, '.github/workflows/ci.yml'), 'utf8');
      expect(onDisk).toBe(newContent);
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('dry-run writes nothing', async () => {
    const repoDir = await mkdtemp(join(tmpdir(), 'sh1pt-install-'));
    try {
      const plan = await planDiff({
        repoDir,
        render: makeRender('.github/workflows/ci.yml', newContent, hash),
      });
      await installPlan(plan, { dryRun: true });
      await expect(readFile(join(repoDir, '.github/workflows/ci.yml'), 'utf8')).rejects.toThrow();
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('skips unchanged files', async () => {
    const repoDir = await mkdtemp(join(tmpdir(), 'sh1pt-install-'));
    try {
      await mkdir(join(repoDir, '.github/workflows'), { recursive: true });
      await writeFile(join(repoDir, '.github/workflows/ci.yml'), newContent, 'utf8');
      const plan = await planDiff({
        repoDir,
        render: makeRender('.github/workflows/ci.yml', newContent, hash),
      });
      const result = await installPlan(plan);
      expect(result.files[0]?.action).toBe('skipped-unchanged');
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('refuses unmanaged conflict without --force', async () => {
    const repoDir = await mkdtemp(join(tmpdir(), 'sh1pt-install-'));
    try {
      await mkdir(join(repoDir, '.github/workflows'), { recursive: true });
      await writeFile(join(repoDir, '.github/workflows/ci.yml'), 'hand-written\n', 'utf8');
      const plan = await planDiff({
        repoDir,
        render: makeRender('.github/workflows/ci.yml', newContent, hash),
      });
      const result = await installPlan(plan);
      expect(result.files[0]?.action).toBe('skipped-conflict');
      const onDisk = await readFile(join(repoDir, '.github/workflows/ci.yml'), 'utf8');
      expect(onDisk).toBe('hand-written\n');
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('overwrites unmanaged conflict with --force', async () => {
    const repoDir = await mkdtemp(join(tmpdir(), 'sh1pt-install-'));
    try {
      await mkdir(join(repoDir, '.github/workflows'), { recursive: true });
      await writeFile(join(repoDir, '.github/workflows/ci.yml'), 'hand-written\n', 'utf8');
      const plan = await planDiff({
        repoDir,
        render: makeRender('.github/workflows/ci.yml', newContent, hash),
      });
      const result = await installPlan(plan, { force: true });
      expect(result.files[0]?.action).toBe('overwritten');
      const onDisk = await readFile(join(repoDir, '.github/workflows/ci.yml'), 'utf8');
      expect(onDisk).toBe(newContent);
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('updates managed file when body changed', async () => {
    const repoDir = await mkdtemp(join(tmpdir(), 'sh1pt-install-'));
    try {
      const oldBody = 'name: OLD\n';
      const oldFile = withHeader(bodyHash(oldBody), oldBody);
      await mkdir(join(repoDir, '.github/workflows'), { recursive: true });
      await writeFile(join(repoDir, '.github/workflows/ci.yml'), oldFile, 'utf8');
      const plan = await planDiff({
        repoDir,
        render: makeRender('.github/workflows/ci.yml', newContent, hash),
      });
      const result = await installPlan(plan);
      expect(result.files[0]?.action).toBe('updated');
      const onDisk = await readFile(join(repoDir, '.github/workflows/ci.yml'), 'utf8');
      expect(onDisk).toBe(newContent);
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });
});
